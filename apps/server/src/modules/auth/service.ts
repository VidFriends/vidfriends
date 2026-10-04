// Accounts and authentication rules: WF-AUTH-1..3, WF-ACCT-2, BR-ACCT-*, BR-INV-2, BR-SES-2.
import { timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { inviteRedemptions, invites, relationships, users } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import { hashToken } from '../../infra/tokens.js';
import type { Deps } from '../../http/deps.js';
import { ApiError } from '../../http/errors.js';
import { audit } from '../audit/service.js';
import { getSettings, updateSettings } from '../settings/service.js';
import { checkPasswordPolicy, hashPassword, verifyDummy, verifyPassword } from './passwords.js';
import { createSession, revokeAllSessions, type NewSession } from './sessions.js';

export type UserRow = typeof users.$inferSelect;

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

/** WF-AUTH-1: claim the instance with the in-memory setup token. */
export async function claimInstance(
  deps: Deps,
  input: {
    setupToken: string;
    instanceName: string;
    username: string;
    password: string;
    client: 'web' | 'mobile';
    userAgent: string;
    ip: string;
  },
): Promise<AuthResult> {
  if (await adminExists(deps.db)) throw new ApiError('not_found', 'Not found');
  const expected = deps.setup.token;
  if (!expected || !sameSecret(expected, input.setupToken)) {
    await audit(deps.db, {
      actorId: null,
      action: 'setup.failed',
      ip: input.ip,
    });
    throw new ApiError('setup_invalid', 'Invalid setup token');
  }
  checkPasswordPolicy(input.password, input.username);
  const passwordHash = await hashPassword(input.password);
  const result = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vidfriends.setup'))`);
    if (await adminExists(tx)) throw new ApiError('not_found', 'Not found');
    const now = deps.clock.now();
    const [user] = await tx
      .insert(users)
      .values({
        id: newId(),
        username: input.username,
        passwordHash,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      })
      .returning();
    if (!user) throw new Error('insert failed');
    await updateSettings(tx, { instance_name: input.instanceName }, user.id);
    const session = await createSession(tx, deps, {
      userId: user.id,
      client: input.client,
      userAgent: input.userAgent,
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

/** WF-AUTH-2: register, consuming an invite atomically (BR-INV-2) and applying auto_friend. */
export async function register(
  deps: Deps,
  input: {
    username: string;
    password: string;
    displayName: string;
    inviteCode: string | undefined;
    client: 'web' | 'mobile';
    userAgent: string;
    ip: string;
  },
): Promise<AuthResult> {
  const settings = await getSettings(deps.db);
  if (!(await adminExists(deps.db))) {
    throw new ApiError('forbidden', 'This instance has not been set up yet');
  }
  if (settings.signup_mode === 'invite_only' && !input.inviteCode) {
    throw new ApiError('invite_invalid', 'A valid invite is required');
  }
  checkPasswordPolicy(input.password, input.username);
  const passwordHash = await hashPassword(input.password);

  try {
    return await deps.db.transaction(async (tx) => {
      const now = deps.clock.now();
      let invite: typeof invites.$inferSelect | undefined;
      if (input.inviteCode) {
        // BR-INV-2: lock the invite row so concurrent registrations never exceed max_uses.
        [invite] = await tx
          .select()
          .from(invites)
          .where(eq(invites.codeHash, hashToken(input.inviteCode)))
          .for('update');
        const usable =
          invite && !invite.revokedAt && invite.expiresAt > now && invite.uses < invite.maxUses;
        if (!usable) throw new ApiError('invite_invalid', 'This invite is not valid');
      }
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);
      if (existing.length) throw new ApiError('username_taken', 'That username is taken');

      const [user] = await tx
        .insert(users)
        .values({
          id: newId(),
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
        })
        .returning();
      if (!user) throw new Error('insert failed');

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
        client: input.client,
        userAgent: input.userAgent,
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

/** WF-AUTH-3: log in. Suspension is reported only after the password verifies. */
export async function login(
  deps: Deps,
  input: {
    username: string;
    password: string;
    client: 'web' | 'mobile';
    userAgent: string;
    ip: string;
  },
): Promise<AuthResult> {
  const [user] = await deps.db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);
  if (!user) {
    await verifyDummy(input.password);
    await audit(deps.db, {
      actorId: null,
      action: 'auth.login_failed',
      metadata: { reason: 'unknown_user' },
      ip: input.ip,
    });
    throw new ApiError('invalid_credentials', 'Wrong username or password');
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await audit(deps.db, {
      actorId: null,
      action: 'auth.login_failed',
      targetType: 'user',
      targetId: user.id,
      metadata: { reason: 'wrong_password' },
      ip: input.ip,
    });
    throw new ApiError('invalid_credentials', 'Wrong username or password');
  }
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
    client: input.client,
    userAgent: input.userAgent,
  });
  const now = deps.clock.now();
  await deps.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, user.id));
  await audit(deps.db, {
    actorId: user.id,
    action: 'auth.login',
    targetType: 'session',
    targetId: session.id,
    metadata: { client: input.client },
    ip: input.ip,
  });
  return { user, session };
}

/** WF-ACCT-2: change password; revokes the user's other sessions (BR-SES-2). */
export async function changePassword(
  deps: Deps,
  input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    keepSession: Buffer;
    ip: string;
  },
): Promise<void> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new ApiError('unauthorized');
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new ApiError('invalid_credentials', 'Current password is wrong');
  }
  checkPasswordPolicy(input.newPassword, user.username, 'new_password');
  const passwordHash = await hashPassword(input.newPassword);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: deps.clock.now() })
      .where(and(eq(users.id, user.id)));
    const revoked = await revokeAllSessions(tx, user.id, input.keepSession);
    await audit(tx, {
      actorId: user.id,
      action: 'user.password_changed',
      targetType: 'user',
      targetId: user.id,
      metadata: { sessions_revoked: revoked },
      ip: input.ip,
    });
  });
}
