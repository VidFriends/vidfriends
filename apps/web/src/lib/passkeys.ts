// Browser side of the passkey ceremonies (ADR-0018): ask the server for options, let the browser
// create or use a passkey, send the result back.
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { TFunction } from 'i18next';
import { ApiError } from '@vidfriends/api-client';
import type { WebAuthnCredential } from '@vidfriends/contracts';
import { errorMessage } from './errors';

interface Ceremony {
  ceremony_id: string;
  options: Record<string, unknown>;
}

export const passkeysSupported = () => browserSupportsWebAuthn();

/** Creates a passkey: `start` returns server options, `finish` sends the new credential. */
export async function createPasskey<T>(
  start: () => Promise<Ceremony>,
  finish: (ceremonyId: string, credential: WebAuthnCredential) => Promise<T>,
): Promise<T> {
  const ceremony = await start();
  const credential = await startRegistration({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return finish(ceremony.ceremony_id, credential as unknown as WebAuthnCredential);
}

/** Uses a passkey: sign-in (any of this server's) or confirmation (the member's own). */
export async function assertPasskey<T>(
  start: () => Promise<Ceremony>,
  finish: (ceremonyId: string, credential: WebAuthnCredential) => Promise<T>,
): Promise<T> {
  const ceremony = await start();
  const credential = await startAuthentication({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return finish(ceremony.ceremony_id, credential as unknown as WebAuthnCredential);
}

/** API errors by code; browser errors as "cancelled" or "not supported". */
export function passkeyErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) return errorMessage(t, error);
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return t('passkeys.cancelled');
  if (name === 'InvalidStateError') return t('passkeys.alreadyRegistered');
  if (!passkeysSupported()) return t('passkeys.unsupported');
  return t('common.genericError');
}
