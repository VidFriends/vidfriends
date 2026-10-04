// Instance pairing (WF-PAIR-1..3, FR-PAIR-03, ADR-0013/0014). There is no default instance: the
// user scans or pastes a join link or an instance URL, and the app verifies it before saving it.
import { API_PREFIX, API_VERSION, InstanceInfo } from '@vidfriends/contracts';

export interface ParsedLink {
  /** Origin of the instance, e.g. `https://vids.example.org` (no trailing slash). */
  baseUrl: string;
  /** Invite code when the input was a join link (`/join/<code>`). */
  inviteCode: string | null;
}

export type ParseError = 'empty' | 'invalid' | 'insecure';

/**
 * WF-PAIR-3 (ADR-0018): https only, because passkeys need it. Plain http is accepted only for
 * this device's own loopback address, which browsers also treat as secure (development and the
 * emulator E2E, which forwards the port with `adb reverse`).
 */
export function isLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** Parses what the user scanned or pasted: a join link, an instance URL or a bare host name. */
export function parseInstanceInput(input: string): ParsedLink | ParseError {
  const raw = input.trim();
  if (!raw) return 'empty';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'invalid';
  if (!url.hostname || url.username || url.password) return 'invalid';
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) return 'insecure';
  const join = /^\/join\/([A-Za-z0-9_-]{6,64})\/?$/.exec(url.pathname);
  return { baseUrl: url.origin, inviteCode: join ? join[1]! : null };
}

export type VerifyResult =
  | { ok: true; info: InstanceInfo }
  | { ok: false; reason: 'unreachable' | 'not_vidfriends' | 'incompatible' };

/** WF-PAIR-1: only a server that answers like VidFriends with a compatible API major is saved. */
export async function verifyInstance(
  baseUrl: string,
  doFetch: typeof fetch = fetch,
): Promise<VerifyResult> {
  let res: Response;
  try {
    res = await doFetch(`${baseUrl}${API_PREFIX}/instance`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!res.ok) return { ok: false, reason: 'not_vidfriends' };
  let parsed;
  try {
    parsed = InstanceInfo.safeParse(await res.json());
  } catch {
    return { ok: false, reason: 'not_vidfriends' };
  }
  if (!parsed.success) return { ok: false, reason: 'not_vidfriends' };
  if (parsed.data.api_version !== API_VERSION) return { ok: false, reason: 'incompatible' };
  return { ok: true, info: parsed.data };
}
