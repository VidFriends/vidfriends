// Outbound requests to member-chosen push servers (ADR-0020, NFR-SEC-05): https to public
// addresses only, with the checked address pinned for the connection so a second DNS answer
// cannot point it elsewhere. Hosts the operator lists in PUSH_PRIVATE_HOSTS may be private and
// use plain http. Redirects are not followed.
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPublicAddress } from '../../modules/videos/url.js';

export type EndpointCheck = 'ok' | 'invalid' | 'insecure';

/** Syntax and scheme of a member-supplied push URL. */
export function checkPushUrl(input: string, privateHosts: readonly string[]): EndpointCheck {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return 'invalid';
  }
  if (url.username || url.password || url.hash || !url.hostname) return 'invalid';
  if (url.protocol === 'https:') return 'ok';
  if (url.protocol === 'http:' && privateHosts.includes(url.hostname.toLowerCase())) return 'ok';
  return url.protocol === 'http:' ? 'insecure' : 'invalid';
}

/** A DNS lookup that only answers with addresses the URL's host may use. */
export function guardedLookup(privateHosts: readonly string[]): LookupFunction {
  return (hostname, options, callback) => {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err, '', 4);
      const allowed = privateHosts.includes(host)
        ? addresses
        : addresses.filter((a) => isPublicAddress(a.address));
      if (!allowed.length) {
        return callback(
          Object.assign(new Error('push host resolves to a private address'), {
            code: 'EPRIVATE',
          }),
          '',
          4,
        );
      }
      if ((options as { all?: boolean }).all) {
        return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, allowed);
      }
      callback(null, allowed[0]!.address, allowed[0]!.family);
    });
  };
}

export type PostFn = (
  url: string,
  init: { headers: Record<string, string>; body: string; timeoutMs?: number },
) => Promise<number>;

/** POSTs through the guard; resolves with the HTTP status (no redirects followed). */
export function createGuardedPost(privateHosts: readonly string[]): PostFn {
  const lookup = guardedLookup(privateHosts);
  return (target, init) =>
    new Promise<number>((resolve, reject) => {
      const check = checkPushUrl(target, privateHosts);
      if (check !== 'ok') return reject(new Error(`push url ${check}`));
      const url = new URL(target);
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(
        url,
        {
          method: 'POST',
          headers: { ...init.headers, 'content-length': String(Buffer.byteLength(init.body)) },
          lookup,
          timeout: init.timeoutMs ?? 10_000,
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('push request timed out')));
      req.on('error', reject);
      req.end(init.body);
    });
}
