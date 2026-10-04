// Accounts and passkey authentication (ADR-0018): WF-AUTH-1..5, WF-ACCT-2, WF-ADM-4, BR-ACCT-*,
// BR-INV-2, BR-SES-2.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { WebAuthnCredential } from '@vidfriends/contracts';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  inviteRedemptions,
  invites,
  mobileAuthCodes,
  passkeys,
  recoveryTokens,
  relationships,
  sessions,
  users,
} from '../../db/schema.js';
import { HOUR, MINUTE } from '../../infra/clock.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import { hashToken, newToken } from '../../infra/tokens.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, notFound } from '../../http/errors.js';
import { audit } from '../audit/service.js';
import { getSettings, updateSettings } from '../settings/service.js';
import { createSession, revokeAllSessions, type NewSession } from './sessions.js';
import {
  authenticationOptions,
  defaultPasskeyName,
  newUserHandle,
  registrationOptions,
  storePasskey,
  takeChallenge,
  verifyAssertion,
  verifyRegistration,
  type PasskeyRow,
} from './webauthn.js';

export type UserRow = typeof users.$inferSelect;
export const RECOVERY_TTL_MS = 24 * HOUR;
export const REAUTH_WINDOW_MS = 5 * MINUTE;
const MOBILE_CODE_TTL_MS = 60_000;

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  if (e?.code === '23505' && e.constraint === constraint) return true;
  return e?.cause ? isUniqueViolation(e.cause, constraint) : false;
}

export async function adminExists(db: DbOrTx): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  return rows.length > 0;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

interface AuthResult {
  user: UserRow;
  session: NewSession;
}

interface Finish {
  ceremonyId: string;
  credential: WebAuthnCredential;
  passkeyName?: string;
  userAgent: string;
  ip: string;
}

const passkeyName = (input: Finish) => input.passkeyName || defaultPasskeyName(input.userAgent);

async function usernameTaken(db: DbOrTx, username: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows.length > 0;
}

// ---- WF-AUTH-1: claim the instance ------------------------------------------------------------

export async function startSetup(
  deps: Deps,
  input: {
    setupToken: string;
    instanceName: string;
    username: string;
    displayName: string;
    ip: string;
  },
) {
  if (await adminExists(deps.db)) throw notFound();
  const expected = deps.setup.token;
  if (!expected || !sameSecret(expected, input.setupToken)) {
    await audit(deps.db, { actorId: null, action: 'setup.failed', ip: input.ip });
    throw new ApiError('setup_invalid', 'Invalid setup token');
  }
  return registrationOptions(deps.db, deps, {
    purpose: 'setup',
    username: input.username,
    displayName: input.displayName,
    userHandle: newUserHandle(),
    context: {
      instance_name: input.instanceName,
      username: input.username,
      display_name: input.displayName,
    },
  });
}

export async function finishSetup(deps: Deps, input: Finish): Promise<AuthResult> {
  if (await adminExists(deps.db)) throw notFound();
  const result = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vidfriends.setup'))`);
    if (await adminExists(tx)) throw notFound();
    const ceremony = await takeChallenge(tx, deps, input.ceremonyId, 'setup');
    const ctx = ceremony.context as {
      instance_name: string;
      username: string;
      display_name: string;
      user_handle: string;
    };
    const verified = await verifyRegistration(deps, ceremony.challenge, input.credential);
    const now = deps.clock.now();
    const [user] = await tx
      .insert(users)
      .values({
        id: newId(),
        username: ctx.username,
        displayName: ctx.display_name,
        webauthnUserId: Buffer.from(ctx.user_handle, 'base64url'),
        role: 'admin',
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      })
      .returning();
    if (!user) throw new Error('insert failed');
    const passkey = await storePasskey(tx, deps, user.id, verified, passkeyName(input));
    await updateSettings(tx, { instance_name: ctx.instance_name }, user.id);
    const session = await createSession(tx, deps, {
      userId: user.id,
      client: 'web',
      userAgent: input.userAgent,
      passkeyId: passkey.id,
    });
    await audit(tx, {
      actorId: user.id,
      action: 'setup.completed',
      targetType: 'user',
      targetId: user.id,
      ip: input.ip,
    });
    return { user, session };
  });
  deps.setup.token = null;
  deps.log.info({ user_id: result.user.id }, 'instance claimed');
  return result;
}

// ---- WF-AUTH-2: join with an invite -----------------------------------------------------------

async function lockUsableInvite(tx: DbOrTx, deps: Deps, codeHash: Buffer) {
  // BR-INV-2: lock the invite row so concurrent registrations never exceed max_uses.
  const [invite] = await tx
    .select()
    .from(invites)
    .where(eq(invites.codeHash, codeHash))
    .for('update');
  const now = deps.clock.now();
  const usable =
    invite && !invite.revokedAt && invite.expiresAt > now && invite.uses < invite.maxUses;
  if (!usable) throw new ApiError('invite_invalid', 'This invite is not valid');
  return invite;
}

export async function startRegister(
  deps: Deps,
  input: { username: string; displayName: string; inviteCode: string | undefined },
) {
  const settings = await getSettings(deps.db);
  if (!(await adminExists(deps.db))) {
    throw new ApiError('forbidden', 'This instance has not been set up yet');
  }
  if (settings.signup_mode === 'invite_only' && !input.inviteCode) {
    throw new ApiError('invite_invalid', 'A valid invite is required');
  }
  const codeHash = input.inviteCode ? hashToken(input.inviteCode) : null;
  if (codeHash) await deps.db.transaction((tx) => lockUsableInvite(tx, deps, codeHash));
  if (await usernameTaken(deps.db, input.username)) {
    throw new ApiError('username_taken', 'That username is taken');
  }
  return registrationOptions(deps.db, deps, {
    purpose: 'register',
    username: input.username,
    displayName: input.displayName,
    userHandle: newUserHandle(),
    context: {
      username: input.username,
      display_name: input.displayName,
      invite_hash: codeHash?.toString('base64url') ?? null,
    },
  });
}

export async function finishRegister(deps: Deps, input: Finish): Promise<AuthResult> {
  try {
    return await deps.db.transaction(async (tx) => {
      const ceremony = await takeChallenge(tx, deps, input.ceremonyId, 'register');
      const ctx = ceremony.context as {
        username: string;
        display_name: string;
        invite_hash: string | null;
        user_handle: string;
      };
      const settings = await getSettings(tx);
      if (settings.signup_mode === 'invite_only' && !ctx.invite_hash) {
        throw new ApiError('invite_invalid', 'A valid invite is required');
      }
      const verified = await verifyRegistration(deps, ceremony.challenge, input.credential);
      const invite = ctx.invite_hash
        ? await lockUsableInvite(tx, deps, Buffer.from(ctx.invite_hash, 'base64url'))
        : undefined;
      if (await usernameTaken(tx, ctx.username)) {
        throw new ApiError('username_taken', 'That username is taken');
      }
      const now = deps.clock.now();
      const [user] = await tx
        .insert(users)
        .values({
          id: newId(),
          username: ctx.username,
          displayName: ctx.display_name,
          webauthnUserId: Buffer.from(ctx.user_handle, 'base64url'),
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
        })
        .returning();
      if (!user) throw new Error('insert failed');
      const passkey = await storePasskey(tx, deps, user.id, verified, passkeyName(input));

      if (invite) {
        await tx
          .update(invites)
          .set({ uses: sql`${invites.uses} + 1` })
          .where(eq(invites.id, invite.id));
        await tx.insert(inviteRedemptions).values({ inviteId: invite.id, userId: user.id });
        if (invite.autoFriend && invite.createdBy !== user.id) {
          // Consent by both sides: the inviter created the invite, the new member accepted it.
          const [low, high] = [invite.createdBy, user.id].sort() as [string, string];
          await tx
            .insert(relationships)
            .values({
              userLow: low,
              userHigh: high,
              state: 'accepted',
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
        }
        await audit(tx, {
          actorId: user.id,
          action: 'invite.redeemed',
          targetType: 'invite',
          targetId: invite.id,
          ip: input.ip,
        });
      }
      await audit(tx, {
        actorId: user.id,
        action: 'user.registered',
        targetType: 'user',
        targetId: user.id,
        ip: input.ip,
      });
      const session = await createSession(tx, deps, {
        userId: user.id,
        client: 'web',
        userAgent: input.userAgent,
        passkeyId: passkey.id,
      });
      return { user, session };
    });
  } catch (err) {
    if (isUniqueViolation(err, 'users_username_key')) {
      throw new ApiError('username_taken', 'That username is taken');
    }
    throw err;
  }
}

// ---- WF-AUTH-3: sign in -------------------------------------------------------------------------

export function startSignIn(deps: Deps) {
  return authenticationOptions(deps.db, deps, { purpose: 'signin' });
}

/** Suspension is reported only after the passkey verifies. */
export async function finishSignIn(
  deps: Deps,
  input: { ceremonyId: string; credential: WebAuthnCredential; userAgent: string; ip: string },
): Promise<AuthResult> {
  const ceremony = await takeChallenge(deps.db, deps, input.ceremonyId, 'signin');
  const passkey = await verifyAssertion(deps.db, deps, ceremony.challenge, input.credential);
  if (!passkey) {
    await audit(deps.db, {
      actorId: null,
      action: 'auth.login_failed',
      metadata: { reason: 'passkey' },
      ip: input.ip,
    });
    throw new ApiError('invalid_credentials', 'That passkey is not registered on this server');
  }
  const [user] = await deps.db.select().from(users).where(eq(users.id, passkey.userId)).limit(1);
  if (!user) throw new ApiError('invalid_credentials', 'Unknown passkey');
  if (user.status !== 'active') {
    await audit(deps.db, {
      actorId: user.id,
      action: 'auth.login_failed',
      targetType: 'user',
      targetId: user.id,
      metadata: { reason: 'suspended' },
      ip: input.ip,
    });
    throw new ApiError('account_suspended', 'This account is suspended');
  }
  const session = await createSession(deps.db, deps, {
    userId: user.id,
    client: 'web',
    userAgent: input.userAgent,
    passkeyId: passkey.id,
  });
  await deps.db.update(users).set({ lastActiveAt: deps.clock.now() }).where(eq(users.id, user.id));
  await audit(deps.db, {
    actorId: user.id,
    action: 'auth.login',
    targetType: 'session',
    targetId: session.id,
    metadata: { client: 'web' },
    ip: input.ip,
  });
  return { user, session };
}

// ---- WF-AUTH-5: mobile browser hand-off ------------------------------------------------------

export async function createMobileCode(deps: Deps, viewer: Viewer, codeChallenge: string) {
  const [row] = await deps.db
    .select({ passkeyId: sessions.passkeyId })
    .from(sessions)
    .where(eq(sessions.tokenHash, viewer.sessionHash))
    .limit(1);
  const code = newToken();
  const now = deps.clock.now();
  await deps.db.insert(mobileAuthCodes).values({
    codeHash: hashToken(code),
    userId: viewer.id,
    passkeyId: row?.passkeyId ?? null,
    codeChallenge,
    expiresAt: new Date(now.getTime() + MOBILE_CODE_TTL_MS),
    createdAt: now,
  });
  return code;
}

const s256 = (verifier: string) =>
  createHash('sha256').update(verifier, 'ascii').digest('base64url');

export async function exchangeMobileCode(
  deps: Deps,
  input: { code: string; verifier: string; userAgent: string; ip: string },
): Promise<AuthResult> {
  return deps.db.transaction(async (tx) => {
    const now = deps.clock.now();
    const [row] = await tx
      .select()
      .from(mobileAuthCodes)
      .where(eq(mobileAuthCodes.codeHash, hashToken(input.code)))
      .for('update');
    const valid =
      row &&
      !row.usedAt &&
      row.expiresAt > now &&
      sameSecret(row.codeChallenge, s256(input.verifier));
    if (!valid) throw new ApiError('code_invalid', 'This sign-in code is not valid');
    await tx
      .update(mobileAuthCodes)
      .set({ usedAt: now })
      .where(eq(mobileAuthCodes.codeHash, row.codeHash));
    const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) throw new ApiError('code_invalid', 'This sign-in code is not valid');
    if (user.status !== 'active') throw new ApiError('account_suspended', 'Account suspended');
    const session = await createSession(tx, deps, {
      userId: user.id,
      client: 'mobile',
      userAgent: input.userAgent,
      passkeyId: row.passkeyId ?? undefined,
    });
    await audit(tx, {
      actorId: user.id,
      action: 'auth.login',
      targetType: 'session',
      targetId: session.id,
      metadata: { client: 'mobile' },
      ip: input.ip,
    });
    return { user, session };
  });
}

// ---- WF-ACCT-2: manage passkeys --------------------------------------------------------------

export async function listPasskeys(deps: Deps, viewer: Viewer) {
  const [current] = await deps.db
    .select({ passkeyId: sessions.passkeyId })
    .from(sessions)
    .where(eq(sessions.tokenHash, viewer.sessionHash));
  const rows = await deps.db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, viewer.id))
    .orderBy(asc(passkeys.createdAt));
  return rows.map((p) => toPasskey(p, current?.passkeyId ?? null));
}

export function toPasskey(p: PasskeyRow, currentId: string | null) {
  return {
    id: p.id,
    name: p.name,
    created_at: p.createdAt.toISOString(),
    last_used_at: p.lastUsedAt?.toISOString() ?? null,
    backed_up: p.backedUp,
    current: p.id === currentId,
  };
}

async function userHandle(db: DbOrTx, userId: string): Promise<{ user: UserRow; handle: Buffer }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound();
  if (user.webauthnUserId) return { user, handle: user.webauthnUserId };
  // Accounts created before passkeys get a handle on first registration.
  const handle = newUserHandle();
  await db.update(users).set({ webauthnUserId: handle }).where(eq(users.id, userId));
  return { user, handle };
}

export async function startAddPasskey(deps: Deps, viewer: Viewer) {
  const { user, handle } = await userHandle(deps.db, viewer.id);
  return registrationOptions(deps.db, deps, {
    purpose: 'add',
    username: user.username,
    displayName: user.displayName,
    userHandle: handle,
    userId: user.id,
  });
}

export async function finishAddPasskey(deps: Deps, viewer: Viewer, input: Finish) {
  return deps.db.transaction(async (tx) => {
    const ceremony = await takeChallenge(tx, deps, input.ceremonyId, 'add', viewer.id);
    const verified = await verifyRegistration(deps, ceremony.challenge, input.credential);
    const passkey = await storePasskey(tx, deps, viewer.id, verified, passkeyName(input));
    await audit(tx, {
      actorId: viewer.id,
      action: 'user.passkey_added',
      targetType: 'passkey',
      targetId: passkey.id,
      ip: input.ip,
    });
    return toPasskey(passkey, null);
  });
}

export async function renamePasskey(deps: Deps, viewer: Viewer, id: string, name: string) {
  const [row] = await deps.db
    .update(passkeys)
    .set({ name })
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, viewer.id)))
    .returning();
  if (!row) throw notFound();
  return toPasskey(row, null);
}

function requireRecentReauth(deps: Deps, viewer: Viewer) {
  const at = viewer.reauthAt?.getTime() ?? 0;
  if (deps.clock.now().getTime() - at > REAUTH_WINDOW_MS) {
    throw new ApiError('reauth_required', 'Confirm with your passkey first');
  }
}

export { requireRecentReauth };

/** Removing a passkey revokes the sessions it created (FK cascade); never the last one. */
export async function removePasskey(deps: Deps, viewer: Viewer, id: string, ip: string) {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, viewer.id)));
    if (!row) throw notFound();
    requireRecentReauth(deps, viewer);
    const others = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.userId, viewer.id), ne(passkeys.id, id)))
      .limit(1);
    if (!others.length) throw new ApiError('last_passkey', 'You cannot remove your last passkey');
    await tx.delete(passkeys).where(eq(passkeys.id, id));
    await audit(tx, {
      actorId: viewer.id,
      action: 'user.passkey_removed',
      targetType: 'passkey',
      targetId: id,
      ip,
    });
  });
}

// ---- Re-authentication for sensitive actions --------------------------------------------------

export function startReauth(deps: Deps, viewer: Viewer) {
  return authenticationOptions(deps.db, deps, { purpose: 'reauth', userId: viewer.id });
}

export async function finishReauth(
  deps: Deps,
  viewer: Viewer,
  input: { ceremonyId: string; credential: WebAuthnCredential },
) {
  const ceremony = await takeChallenge(deps.db, deps, input.ceremonyId, 'reauth', viewer.id);
  const passkey = await verifyAssertion(deps.db, deps, ceremony.challenge, input.credential);
  if (!passkey || passkey.userId !== viewer.id) {
    throw new ApiError('invalid_credentials', 'That passkey does not belong to this account');
  }
  await deps.db
    .update(sessions)
    .set({ reauthAt: deps.clock.now() })
    .where(eq(sessions.tokenHash, viewer.sessionHash));
}

// ---- WF-ADM-4: recovery links -----------------------------------------------------------------

export async function createRecoveryLink(
  deps: Deps,
  input: { userId: string; actorId: string | null; ip: string | null },
) {
  const [user] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!user) throw notFound();
  const token = newToken();
  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + RECOVERY_TTL_MS);
  await deps.db.insert(recoveryTokens).values({
    tokenHash: hashToken(token),
    userId: user.id,
    createdBy: input.actorId,
    expiresAt,
    createdAt: now,
  });
  await audit(deps.db, {
    actorId: input.actorId,
    action: input.actorId ? 'admin.recovery_link_created' : 'user.recovery_link',
    targetType: 'user',
    targetId: user.id,
    ip: input.ip ?? undefined,
  });
  return { url: `${deps.env.PUBLIC_URL}/recover/${token}`, expires_at: expiresAt.toISOString() };
}

async function usableRecovery(db: DbOrTx, deps: Deps, token: string, lock = false) {
  const q = db
    .select({ r: recoveryTokens, u: users })
    .from(recoveryTokens)
    .innerJoin(users, eq(users.id, recoveryTokens.userId))
    .where(eq(recoveryTokens.tokenHash, hashToken(token)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row || row.r.usedAt || row.r.expiresAt <= deps.clock.now()) {
    throw new ApiError(
      'recovery_invalid',
      'This recovery link is not valid. Ask your admin for a new one.',
    );
  }
  return row;
}

export async function getRecovery(deps: Deps, token: string) {
  const { r, u } = await usableRecovery(deps.db, deps, token);
  return {
    username: u.username,
    display_name: u.displayName,
    expires_at: r.expiresAt.toISOString(),
  };
}

export async function startRecovery(deps: Deps, token: string) {
  const { u } = await usableRecovery(deps.db, deps, token);
  const { handle } = await userHandle(deps.db, u.id);
  return registrationOptions(deps.db, deps, {
    purpose: 'recover',
    username: u.username,
    displayName: u.displayName,
    userHandle: handle,
    userId: u.id,
    context: { token_hash: hashToken(token).toString('base64url') },
  });
}

/** The new passkey replaces all others and every session is revoked (lost-device recovery). */
export async function finishRecovery(
  deps: Deps,
  token: string,
  input: Finish,
): Promise<AuthResult> {
  return deps.db.transaction(async (tx) => {
    const { r, u } = await usableRecovery(tx, deps, token, true);
    if (u.status !== 'active') throw new ApiError('account_suspended', 'This account is suspended');
    const ceremony = await takeChallenge(tx, deps, input.ceremonyId, 'recover', u.id);
    if (
      (ceremony.context as { token_hash?: string }).token_hash !== r.tokenHash.toString('base64url')
    ) {
      throw new ApiError('ceremony_invalid', 'This passkey request expired. Please try again.');
    }
    const verified = await verifyRegistration(deps, ceremony.challenge, input.credential);
    const now = deps.clock.now();
    await tx
      .update(recoveryTokens)
      .set({ usedAt: now })
      .where(eq(recoveryTokens.tokenHash, r.tokenHash));
    const revoked = await revokeAllSessions(tx, u.id);
    const removed = await tx
      .delete(passkeys)
      .where(eq(passkeys.userId, u.id))
      .returning({ id: passkeys.id });
    const passkey = await storePasskey(tx, deps, u.id, verified, passkeyName(input));
    await audit(tx, {
      actorId: u.id,
      action: 'user.recovered',
      targetType: 'user',
      targetId: u.id,
      metadata: { sessions_revoked: revoked, passkeys_removed: removed.length },
      ip: input.ip,
    });
    const session = await createSession(tx, deps, {
      userId: u.id,
      client: 'web',
      userAgent: input.userAgent,
      passkeyId: passkey.id,
    });
    return { user: u, session };
  });
}
