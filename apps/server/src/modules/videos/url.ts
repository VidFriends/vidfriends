// Link validation, normalisation and SSRF guard (BR-MED-1, LLD §4, NFR-SEC-05, L-09).
// Everything here runs before any network fetch of user input.
import { BlockList, isIP } from 'node:net';

export const MAX_URL_LENGTH = 2048;

/** Short-link hosts resolved by one allowlisted redirect walk (LLD §4). */
export const SHORT_LINK_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);

const TRACKING_PARAMS = new Set([
  'si',
  'feature',
  'igshid',
  'igsh',
  '_r',
  'is_from_webapp',
  'fbclid',
  'gclid',
]);

const PLATFORMS: [string, string][] = [
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['tiktok.com', 'tiktok'],
  ['instagram.com', 'instagram'],
  ['facebook.com', 'facebook'],
  ['fb.watch', 'facebook'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['reddit.com', 'reddit'],
  ['redd.it', 'reddit'],
  ['vimeo.com', 'vimeo'],
];

export type UrlCheck =
  | {
      ok: true;
      url: string;
      normalized: string;
      host: string;
      platform: string;
      needsResolution: boolean;
    }
  | { ok: false; reason: string };

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function platformOf(host: string): string {
  for (const [domain, name] of PLATFORMS) if (hostMatches(host, domain)) return name;
  return host;
}

/**
 * Validates and normalises a user-supplied link without touching the network.
 * `allowlist` is the instance setting `platform_allowlist` (registrable domains).
 */
export function checkUrl(input: string, allowlist: readonly string[]): UrlCheck {
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'length' };
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: 'whitespace' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not_a_url' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' };
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  if (url.port && url.port !== '443' && url.port !== '80') return { ok: false, reason: 'port' };
  let host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isIP(host.replace(/^\[|\]$/g, '')) || host.startsWith('['))
    return { ok: false, reason: 'ip_literal' };
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost'))
    return { ok: false, reason: 'local_host' };
  if (/\.(local|internal|lan|home|arpa|test|invalid|example)$/.test(host))
    return { ok: false, reason: 'local_host' };
  if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, reason: 'host_chars' }; // punycode only
  if (!allowlist.some((d) => hostMatches(host, d))) return { ok: false, reason: 'not_allowlisted' };

  // http is upgraded; every allowlisted platform serves https.
  url.protocol = 'https:';
  url.port = '';
  url.hash = '';
  host = host.replace(/^(www|m|mobile)\./, '');
  url.hostname = host;

  // Canonical forms (LLD §4).
  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1];
    if (!id) return { ok: false, reason: 'no_video_id' };
    const t = url.searchParams.get('t');
    url = new URL(
      `https://youtube.com/watch?v=${encodeURIComponent(id)}${t ? `&t=${encodeURIComponent(t)}` : ''}`,
    );
    host = 'youtube.com';
  }

  const params = [...url.searchParams.entries()].filter(
    ([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k.toLowerCase()),
  );
  params.sort(([a], [b]) => a.localeCompare(b));
  url.search = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');

  const normalized = url.toString();
  return {
    ok: true,
    url: normalized,
    normalized,
    host,
    platform: platformOf(host),
    needsResolution: SHORT_LINK_HOSTS.has(url.hostname),
  };
}

// Private, loopback, link-local, CGNAT, documentation, multicast and reserved ranges (NFR-SEC-05).
const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, bits, 'ipv6');
}

export function isPublicAddress(input: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is judged by its IPv4 address. (A ::ffff:0:0/96 rule in the
  // BlockList would also match every plain IPv4 address.)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(input);
  if (!mapped && /^::ffff:/i.test(input)) return false; // hex-form mapped address: refuse
  const address = mapped ? (mapped[1] as string) : input;
  const family = isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;

/** Resolves the host and refuses it unless every address is public (DNS-rebinding aware). */
export async function assertPublicHost(host: string, lookup: Lookup): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new UrlRejected('dns_failed');
  }
  if (!addresses.length) throw new UrlRejected('dns_empty');
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) throw new UrlRejected('private_address');
  }
}

export class UrlRejected extends Error {
  constructor(readonly reason: string) {
    super(`url rejected: ${reason}`);
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; redirect: 'manual'; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
}>;

/**
 * Resolves a short link (vm.tiktok.com) by following at most 5 redirects with HEAD requests, where
 * every hop must itself be allowlisted and public before it is requested.
 */
export async function resolveShortLink(
  start: string,
  allowlist: readonly string[],
  deps: { lookup: Lookup; fetch: FetchLike },
): Promise<UrlCheck> {
  let current = checkUrl(start, allowlist);
  for (let hop = 0; hop < 5; hop++) {
    if (!current.ok) return current;
    if (!current.needsResolution) return current;
    await assertPublicHost(new URL(current.url).hostname, deps.lookup);
    const res = await deps.fetch(current.url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location)
      return { ok: false, reason: 'short_link_unresolved' };
    current = checkUrl(new URL(location, current.url).toString(), allowlist);
  }
  return { ok: false, reason: 'too_many_redirects' };
}
