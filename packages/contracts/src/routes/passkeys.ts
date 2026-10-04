// Passkey-only sign-in (ADR-0018): setup, join, sign-in, passkey management, re-authentication,
// recovery links and the mobile browser hand-off (FR-AUTH-01..04, FR-ACCT-02/03, FR-ADM-03).
import { z } from 'zod';
import { Id, Timestamp } from '../common.js';
import { defineRoute } from '../route.js';
import { DisplayName, SessionResponse, SelfUser, Username } from './accounts.js';

/** WebAuthn options as JSON (PublicKeyCredentialCreation/RequestOptionsJSON), passed to the browser. */
export const WebAuthnOptions = z.record(z.string(), z.unknown());

/** A WebAuthn credential response as JSON (Registration/AuthenticationResponseJSON). */
export const WebAuthnCredential = z
  .object({
    id: z.string().min(1).max(1024),
    rawId: z.string().min(1).max(1024),
    type: z.literal('public-key'),
    response: z.record(z.string(), z.unknown()),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    authenticatorAttachment: z.string().optional(),
  })
  .loose();
export type WebAuthnCredential = z.infer<typeof WebAuthnCredential>;

/** BR-ACCT-2: passkey names. */
export const PasskeyName = z.string().trim().min(1).max(50);

export const Ceremony = z.object({ ceremony_id: Id, options: WebAuthnOptions });

const Finish = z.object({
  ceremony_id: Id,
  credential: WebAuthnCredential,
  passkey_name: PasskeyName.optional(),
});

export const Passkey = z.object({
  id: Id,
  name: z.string(),
  created_at: Timestamp,
  last_used_at: Timestamp.nullable(),
  /** Synced by a password manager or platform account (can be restored on a new device). */
  backed_up: z.boolean(),
  /** The passkey that signed in the current session. */
  current: z.boolean(),
});
export type Passkey = z.infer<typeof Passkey>;

export const setupOptions = defineRoute({
  id: 'setupOptions',
  method: 'post',
  path: '/setup/options',
  auth: 'public',
  tag: 'instance',
  summary:
    'Start claiming the instance: check the setup token, return passkey options (FR-AUTH-01)',
  body: z.object({
    setup_token: z.string().min(1).max(200),
    instance_name: z.string().trim().min(1).max(60),
    username: Username,
    display_name: DisplayName.optional(),
  }),
  status: 200,
  response: Ceremony,
  errors: ['setup_invalid', 'not_found', 'rate_limited'],
});

export const setup = defineRoute({
  id: 'setup',
  method: 'post',
  path: '/setup',
  auth: 'public',
  tag: 'instance',
  summary: 'Finish claiming the instance with the new passkey; signs in (FR-AUTH-01)',
  body: Finish,
  status: 201,
  response: SessionResponse,
  errors: ['ceremony_invalid', 'passkey_invalid', 'not_found', 'rate_limited'],
});

export const registerOptions = defineRoute({
  id: 'registerOptions',
  method: 'post',
  path: '/auth/register/options',
  auth: 'public',
  tag: 'auth',
  summary: 'Start joining: check the invite and username, return passkey options (FR-AUTH-02)',
  body: z.object({
    username: Username,
    display_name: DisplayName.optional(),
    invite_code: z.string().max(200).optional(),
  }),
  status: 200,
  response: Ceremony,
  errors: ['invite_invalid', 'username_taken', 'rate_limited'],
});

export const register = defineRoute({
  id: 'register',
  method: 'post',
  path: '/auth/register',
  auth: 'public',
  tag: 'auth',
  summary: 'Finish joining with the new passkey; consumes the invite and signs in (FR-AUTH-02)',
  body: Finish,
  status: 201,
  response: SessionResponse,
  errors: [
    'ceremony_invalid',
    'passkey_invalid',
    'invite_invalid',
    'username_taken',
    'rate_limited',
  ],
});

export const signInOptions = defineRoute({
  id: 'signInOptions',
  method: 'post',
  path: '/auth/signin/options',
  auth: 'public',
  tag: 'auth',
  summary: 'Start a passkey sign-in (discoverable credentials, FR-AUTH-04)',
  body: z.object({}),
  status: 200,
  response: Ceremony,
  errors: ['rate_limited'],
});

export const signIn = defineRoute({
  id: 'signIn',
  method: 'post',
  path: '/auth/signin',
  auth: 'public',
  tag: 'auth',
  summary: 'Finish a passkey sign-in; creates a cookie session (FR-AUTH-04)',
  body: z.object({ ceremony_id: Id, credential: WebAuthnCredential }),
  status: 200,
  response: SessionResponse,
  errors: ['ceremony_invalid', 'invalid_credentials', 'account_suspended', 'rate_limited'],
});

export const createMobileCode = defineRoute({
  id: 'createMobileCode',
  method: 'post',
  path: '/auth/mobile/code',
  auth: 'member',
  tag: 'auth',
  summary: 'Browser hand-off: a single-use 60 s code bound to the app’s PKCE challenge (WF-AUTH-5)',
  body: z.object({ code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'code_challenge') }),
  status: 201,
  response: z.object({ code: z.string() }),
});

export const exchangeMobileCode = defineRoute({
  id: 'exchangeMobileCode',
  method: 'post',
  path: '/auth/mobile/token',
  auth: 'public',
  tag: 'auth',
  summary: 'Exchange a hand-off code and PKCE verifier for a bearer session (WF-AUTH-5)',
  body: z.object({
    code: z.string().min(20).max(100),
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/, 'code_verifier'),
  }),
  status: 200,
  response: z.object({ user: SelfUser, token: z.string() }),
  errors: ['code_invalid', 'account_suspended', 'rate_limited'],
});

const PasskeyId = z.object({ id: Id });

export const listPasskeys = defineRoute({
  id: 'listPasskeys',
  method: 'get',
  path: '/me/passkeys',
  auth: 'member',
  tag: 'me',
  summary: 'My passkeys (FR-ACCT-02)',
  status: 200,
  response: z.object({ items: z.array(Passkey) }),
});

export const addPasskeyOptions = defineRoute({
  id: 'addPasskeyOptions',
  method: 'post',
  path: '/me/passkeys/options',
  auth: 'member',
  tag: 'me',
  summary: 'Start adding a passkey (FR-ACCT-02)',
  body: z.object({}),
  status: 200,
  response: Ceremony,
  errors: ['too_many_passkeys'],
});

export const addPasskey = defineRoute({
  id: 'addPasskey',
  method: 'post',
  path: '/me/passkeys',
  auth: 'member',
  tag: 'me',
  summary: 'Finish adding a passkey (FR-ACCT-02)',
  body: Finish,
  status: 201,
  response: z.object({ passkey: Passkey }),
  errors: ['ceremony_invalid', 'passkey_invalid', 'too_many_passkeys'],
});

export const renamePasskey = defineRoute({
  id: 'renamePasskey',
  method: 'patch',
  path: '/me/passkeys/{id}',
  auth: 'member',
  tag: 'me',
  summary: 'Rename one of my passkeys (FR-ACCT-02)',
  params: PasskeyId,
  body: z.object({ name: PasskeyName }),
  status: 200,
  response: z.object({ passkey: Passkey }),
  errors: ['not_found'],
});

export const removePasskey = defineRoute({
  id: 'removePasskey',
  method: 'delete',
  path: '/me/passkeys/{id}',
  auth: 'member',
  tag: 'me',
  summary:
    'Remove one of my passkeys after a recent passkey confirmation; revokes its sessions (FR-ACCT-02)',
  params: PasskeyId,
  status: 204,
  response: null,
  errors: ['not_found', 'reauth_required', 'last_passkey'],
});

export const reauthOptions = defineRoute({
  id: 'reauthOptions',
  method: 'post',
  path: '/me/reauth/options',
  auth: 'member',
  tag: 'me',
  summary: 'Start confirming it is me with one of my passkeys (WF-ACCT-2/3)',
  body: z.object({}),
  status: 200,
  response: Ceremony,
});

export const reauth = defineRoute({
  id: 'reauth',
  method: 'post',
  path: '/me/reauth',
  auth: 'member',
  tag: 'me',
  summary: 'Confirm with a passkey; sensitive actions are allowed for 5 minutes (WF-ACCT-2/3)',
  body: z.object({ ceremony_id: Id, credential: WebAuthnCredential }),
  status: 204,
  response: null,
  errors: ['ceremony_invalid', 'invalid_credentials', 'rate_limited'],
});

export const adminRecoveryLink = defineRoute({
  id: 'adminRecoveryLink',
  method: 'post',
  path: '/admin/users/{id}/recovery-link',
  auth: 'admin',
  tag: 'admin',
  summary:
    'Create a single-use recovery link (24 h) that registers a new passkey (FR-ADM-03, WF-ADM-4)',
  params: z.object({ id: Id }),
  status: 201,
  response: z.object({ url: z.string(), expires_at: Timestamp }),
  errors: ['not_found'],
});

const RecoveryToken = z.object({ token: z.string().min(20).max(100) });

export const getRecovery = defineRoute({
  id: 'getRecovery',
  method: 'get',
  path: '/auth/recovery/{token}',
  auth: 'public',
  tag: 'auth',
  summary: 'Who a recovery link is for (FR-ADM-03)',
  params: RecoveryToken,
  status: 200,
  response: z.object({ username: z.string(), display_name: z.string(), expires_at: Timestamp }),
  errors: ['recovery_invalid', 'rate_limited'],
});

export const recoveryOptions = defineRoute({
  id: 'recoveryOptions',
  method: 'post',
  path: '/auth/recovery/{token}/options',
  auth: 'public',
  tag: 'auth',
  summary: 'Start registering a passkey with a recovery link (FR-ADM-03)',
  params: RecoveryToken,
  body: z.object({}),
  status: 200,
  response: Ceremony,
  errors: ['recovery_invalid', 'rate_limited'],
});

export const recover = defineRoute({
  id: 'recover',
  method: 'post',
  path: '/auth/recovery/{token}',
  auth: 'public',
  tag: 'auth',
  summary:
    'Finish recovery: the new passkey replaces all others, every session is revoked, and this one signs in (FR-ADM-03)',
  params: RecoveryToken,
  body: Finish,
  status: 201,
  response: SessionResponse,
  errors: ['recovery_invalid', 'ceremony_invalid', 'passkey_invalid', 'rate_limited'],
});
