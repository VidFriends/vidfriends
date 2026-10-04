// WF-AUTH-5 (ADR-0018): the app signs in with a passkey through the server's web page in the
// system's secure browser sheet. The page returns a single-use code to `vidfriends://auth`, bound
// to this app instance by PKCE (S256), and the app exchanges it for a bearer session.

export const CALLBACK_URL = 'vidfriends://auth';

const toBase64Url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Base64url of random bytes, e.g. a PKCE verifier (43+ chars) or `state`. */
export function randomToken(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return toBase64Url(btoa(s));
}

/** S256 code challenge from a base64 SHA-256 digest of the verifier. */
export const challengeFromDigest = (base64Digest: string) => toBase64Url(base64Digest);

export interface HandoffRequest {
  mode: 'signin' | 'join';
  state: string;
  codeChallenge: string;
  invite?: string | null;
}

/** The server page that runs the passkey ceremony (only on the paired instance). */
export function handoffUrl(baseUrl: string, r: HandoffRequest): string {
  const q = new URLSearchParams({ mode: r.mode, state: r.state, code_challenge: r.codeChallenge });
  if (r.invite) q.set('invite', r.invite);
  return `${baseUrl}/app-auth?${q.toString()}`;
}

/** Reads the code from the callback; rejects anything not ours or with another `state`. */
export function parseCallback(url: string, expectedState: string): string | null {
  if (!url.startsWith(`${CALLBACK_URL}?`)) return null;
  const q = new URLSearchParams(url.slice(CALLBACK_URL.length + 1));
  const code = q.get('code');
  if (q.get('state') !== expectedState || !code || !/^[A-Za-z0-9_-]{20,100}$/.test(code)) {
    return null;
  }
  return code;
}
