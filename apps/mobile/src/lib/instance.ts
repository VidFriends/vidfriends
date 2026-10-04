// Instance pairing (WF-PAIR-1..3, FR-PAIR-03, ADR-0013/0014). There is no default instance: the
// user scans or pastes a join link or an instance URL, and the app verifies it before saving it.
import { API_PREFIX, API_VERSION, InstanceInfo } from '@vidfriends/contracts';

export interface ParsedLink {
  /** Origin of the instance, e.g. `https://vids.example.org` (no trailing slash). */
  baseUrl: string;
  /** Invite code when the input was a join link (`/join/<code>`). */
  inviteCode: string | null;
  /** True for plain `http://`, allowed only to private-network addresses (WF-PAIR-3). */
  insecure: boolean;
}

export type ParseError = 'empty' | 'invalid' | 'insecure_public';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * WF-PAIR-3: private-network IP literals only. Host names never qualify, because the app cannot
 * know what a name resolves to before connecting. Assumption: loopback counts (emulators and
 * development), link-local and IPv6 unique-local addresses count.
 */
export function isPrivateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  const m = IPV4.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if ([m[1], m[2], m[3], m[4]].some((o) => Number(o) > 255)) return false;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127 ||
      (a === 169 && b === 254)
    );
  }
  if (h.includes(':')) {
    return h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
  }
  return false;
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
  const insecure = url.protocol === 'http:';
  if (insecure && !isPrivateAddress(url.hostname)) return 'insecure_public';
  const join = /^\/join\/([A-Za-z0-9_-]{6,64})\/?$/.exec(url.pathname);
  return { baseUrl: url.origin, inviteCode: join ? join[1]! : null, insecure };
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
