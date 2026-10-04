// WebAuthn ceremonies (ADR-0018, LLD §5): single-use 5-minute challenges, discoverable
// credentials with user verification, relying party = the PUBLIC_URL host.
import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { WebAuthnCredential } from '@vidfriends/contracts';
import { and, eq, gt, lt } from 'drizzle-orm';
import { passkeys, webauthnChallenges } from '../../db/schema.js';
import { MINUTE } from '../../infra/clock.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import type { Deps } from '../../http/deps.js';
import { ApiError } from '../../http/errors.js';
import { getSettings } from '../settings/service.js';

export const CHALLENGE_TTL_MS = 5 * MINUTE;
export const MAX_PASSKEYS = 10;
type Purpose = (typeof webauthnChallenges.$inferSelect)['purpose'];
export type PasskeyRow = typeof passkeys.$inferSelect;

export function relyingParty(deps: Deps) {
  const url = new URL(deps.env.PUBLIC_URL);
  return { rpID: url.hostname, origin: url.origin };
}

/** A fresh WebAuthn user handle (never the database id). */
export const newUserHandle = () => randomBytes(32);

async function saveChallenge(
  db: DbOrTx,
  deps: Deps,
  input: { purpose: Purpose; challenge: string; userId?: string; context?: object },
): Promise<string> {
  const now = deps.clock.now();
  // Expired ceremonies are swept opportunistically; they are never valid anyway.
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now));
  const id = newId();
  await db.insert(webauthnChallenges).values({
    id,
    challenge: input.challenge,
    purpose: input.purpose,
    userId: input.userId ?? null,
    context: input.context ?? {},
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    createdAt: now,
  });
  return id;
}

/** Consumes a ceremony (single use). Wrong id, purpose, user or an expired one: ceremony_invalid. */
export async function takeChallenge(
  db: DbOrTx,
  deps: Deps,
  id: string,
  purpose: Purpose,
  userId?: string,
) {
  const [row] = await db
    .delete(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.id, id),
        eq(webauthnChallenges.purpose, purpose),
        gt(webauthnChallenges.expiresAt, deps.clock.now()),
      ),
    )
    .returning();
  if (!row || (userId && row.userId !== userId)) {
    throw new ApiError('ceremony_invalid', 'This passkey request expired. Please try again.');
  }
  return row;
}

/** Options to create a passkey for `user`; `context` is what the finishing step will need. */
export async function registrationOptions(
  db: DbOrTx,
  deps: Deps,
  input: {
    purpose: Purpose;
    username: string;
    displayName: string;
    userHandle: Buffer;
    userId?: string;
    context?: object;
  },
) {
  const settings = await getSettings(db);
  const { rpID } = relyingParty(deps);
  const existing = input.userId
    ? await db
        .select({ id: passkeys.credentialId, transports: passkeys.transports })
        .from(passkeys)
        .where(eq(passkeys.userId, input.userId))
    : [];
  const options = await generateRegistrationOptions({
    rpName: settings.instance_name,
    rpID,
    userName: input.username,
    userDisplayName: input.displayName || input.username,
    userID: new Uint8Array(input.userHandle),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: [-7, -257],
    timeout: CHALLENGE_TTL_MS,
  });
  const ceremonyId = await saveChallenge(db, deps, {
    purpose: input.purpose,
    challenge: options.challenge,
    userId: input.userId,
    context: { ...input.context, user_handle: input.userHandle.toString('base64url') },
  });
  return { ceremony_id: ceremonyId, options: options as unknown as Record<string, unknown> };
}

export interface VerifiedPasskey {
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  transports: string[];
  backedUp: boolean;
}

/** Verifies an attestation against a consumed ceremony. */
export async function verifyRegistration(
  deps: Deps,
  challenge: string,
  credential: WebAuthnCredential,
): Promise<VerifiedPasskey> {
  const { rpID, origin } = relyingParty(deps);
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: credential as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
  } catch {
    throw new ApiError('passkey_invalid', 'The passkey could not be verified');
  }
  if (!result.verified) throw new ApiError('passkey_invalid', 'The passkey could not be verified');
  const c = result.registrationInfo.credential;
  return {
    credentialId: c.id,
    publicKey: Buffer.from(c.publicKey),
    counter: c.counter,
    transports: c.transports ?? [],
    backedUp: result.registrationInfo.credentialBackedUp,
  };
}

/** Default passkey name: the browser does not tell us the device, so use the platform hint. */
export function defaultPasskeyName(userAgent: string): string {
  if (/iPhone|iPad/.test(userAgent)) return 'iPhone or iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'Passkey';
}

export async function storePasskey(
  db: DbOrTx,
  deps: Deps,
  userId: string,
  verified: VerifiedPasskey,
  name: string,
): Promise<PasskeyRow> {
  const count = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
  if (count.length >= MAX_PASSKEYS) {
    throw new ApiError('too_many_passkeys', `At most ${MAX_PASSKEYS} passkeys per account`);
  }
  const [row] = await db
    .insert(passkeys)
    .values({
      id: newId(),
      userId,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      counter: verified.counter,
      transports: verified.transports,
      backedUp: verified.backedUp,
      name: name.slice(0, 50),
      createdAt: deps.clock.now(),
    })
    .onConflictDoNothing({ target: passkeys.credentialId })
    .returning();
  if (!row) throw new ApiError('passkey_invalid', 'This passkey is already registered');
  return row;
}

/** Options for an assertion: any discoverable passkey, or only `userId`'s (re-authentication). */
export async function authenticationOptions(
  db: DbOrTx,
  deps: Deps,
  input: { purpose: Purpose; userId?: string },
) {
  const { rpID } = relyingParty(deps);
  const allow = input.userId
    ? await db
        .select({ id: passkeys.credentialId, transports: passkeys.transports })
        .from(passkeys)
        .where(eq(passkeys.userId, input.userId))
    : undefined;
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    timeout: CHALLENGE_TTL_MS,
    ...(allow
      ? { allowCredentials: allow.map((c) => ({ id: c.id, transports: c.transports })) }
      : {}),
  });
  const ceremonyId = await saveChallenge(db, deps, {
    purpose: input.purpose,
    challenge: options.challenge,
    userId: input.userId,
  });
  return { ceremony_id: ceremonyId, options: options as unknown as Record<string, unknown> };
}

/**
 * Verifies an assertion and updates the passkey's counter and last use. Returns the passkey, or
 * null when the credential is unknown or the signature does not verify.
 */
export async function verifyAssertion(
  db: DbOrTx,
  deps: Deps,
  challenge: string,
  credential: WebAuthnCredential,
): Promise<PasskeyRow | null> {
  const [passkey] = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, credential.id))
    .limit(1);
  if (!passkey) return null;
  const { rpID, origin } = relyingParty(deps);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: credential as unknown as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports as never,
      },
      requireUserVerification: true,
    });
  } catch {
    // Includes a counter that went backwards: a possibly cloned authenticator.
    return null;
  }
  if (!result.verified) return null;
  const [updated] = await db
    .update(passkeys)
    .set({
      counter: result.authenticationInfo.newCounter,
      backedUp: result.authenticationInfo.credentialBackedUp,
      lastUsedAt: deps.clock.now(),
    })
    .where(eq(passkeys.id, passkey.id))
    .returning();
  return updated ?? passkey;
}
