// Client IP derivation (NFR-SEC-06, L-20): X-Forwarded-For is honoured only when the direct peer
// is a trusted proxy, and then only the right-most untrusted hop is used.
import { BlockList, isIP } from 'node:net';

export function normalizeIp(ip: string): string {
  const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return v4mapped ? (v4mapped[1] as string) : ip;
}

export function createTrustedProxies(cidrs: string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [addr, bits] = cidr.split('/');
    const family = isIP(addr ?? '');
    if (!addr || !family) throw new Error(`invalid TRUSTED_PROXIES entry: ${cidr}`);
    const type = family === 6 ? 'ipv6' : 'ipv4';
    if (bits === undefined) list.addAddress(addr, type);
    else list.addSubnet(addr, Number(bits), type);
  }
  return list;
}

function isTrusted(list: BlockList, ip: string): boolean {
  const family = isIP(ip);
  if (!family) return false;
  return list.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

export function resolveClientIp(
  peer: string | undefined,
  forwardedFor: string | undefined,
  trusted: BlockList,
): string {
  const direct = peer ? normalizeIp(peer) : 'unknown';
  if (!peer || !forwardedFor || !isTrusted(trusted, direct)) return direct;
  const hops = forwardedFor
    .split(',')
    .map((h) => normalizeIp(h.trim()))
    .filter((h) => isIP(h));
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i] as string;
    if (!isTrusted(trusted, hop)) return hop;
  }
  return hops[0] ?? direct;
}
