// NFR-SEC-06, L-20: X-Forwarded-For is trusted only from configured proxies.
import { describe, expect, it } from 'vitest';
import { createTrustedProxies, resolveClientIp } from '../src/infra/ip.js';

const trusted = createTrustedProxies(['172.16.0.0/12', '127.0.0.1/32', '::1/128']);

describe('resolveClientIp', () => {
  it('ignores X-Forwarded-For from untrusted peers', () => {
    expect(resolveClientIp('203.0.113.9', '1.2.3.4', trusted)).toBe('203.0.113.9');
  });
  it('uses the right-most untrusted hop behind a trusted proxy', () => {
    expect(resolveClientIp('172.18.0.5', '9.9.9.9, 198.51.100.7', trusted)).toBe('198.51.100.7');
    expect(resolveClientIp('::ffff:172.18.0.5', '198.51.100.7, 172.18.0.2', trusted)).toBe(
      '198.51.100.7',
    );
  });
  it('falls back to the peer when the header is missing or garbage', () => {
    expect(resolveClientIp('127.0.0.1', undefined, trusted)).toBe('127.0.0.1');
    expect(resolveClientIp('127.0.0.1', 'not-an-ip', trusted)).toBe('127.0.0.1');
  });
});
