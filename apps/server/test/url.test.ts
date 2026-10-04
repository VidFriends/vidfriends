// M3-T2: BR-MED-1 URL validation and normalisation, NFR-SEC-05 SSRF guard (≥ 40 cases).
import { DEFAULT_PLATFORM_ALLOWLIST } from '@vidfriends/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertPublicHost,
  checkUrl,
  isPublicAddress,
  resolveShortLink,
  UrlRejected,
} from '../src/modules/videos/url.js';

const allow = DEFAULT_PLATFORM_ALLOWLIST;

// [input, expected normalized URL or rejection reason]
const VALID: [string, string][] = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
  ['http://youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=abc&feature=share', 'https://youtube.com/watch?v=abc'],
  ['https://youtu.be/abc123?si=XYZtracking', 'https://youtube.com/watch?v=abc123'],
  ['https://youtu.be/abc123?t=42', 'https://youtube.com/watch?t=42&v=abc123'],
  ['https://www.youtube.com/shorts/xyz789?feature=share', 'https://youtube.com/shorts/xyz789'],
  ['https://youtube.com/watch?v=a&utm_source=x&utm_medium=y', 'https://youtube.com/watch?v=a'],
  ['https://www.youtube.com/watch?v=a#t=30', 'https://youtube.com/watch?v=a'],
  ['  https://youtube.com/watch?v=a  ', 'https://youtube.com/watch?v=a'],
  ['https://YouTube.COM/watch?v=CaseKept', 'https://youtube.com/watch?v=CaseKept'],
  [
    'https://www.tiktok.com/@user/video/7300000000000000000?is_from_webapp=1&_r=1',
    'https://tiktok.com/@user/video/7300000000000000000',
  ],
  ['https://www.instagram.com/reel/Cabc123/?igshid=xyz', 'https://instagram.com/reel/Cabc123'],
  [
    'https://www.instagram.com/reel/Cabc123/?igsh=xyz&utm_source=ig',
    'https://instagram.com/reel/Cabc123',
  ],
  ['https://www.facebook.com/watch/?v=1234', 'https://facebook.com/watch?v=1234'],
  ['https://m.facebook.com/reel/987', 'https://facebook.com/reel/987'],
  ['https://fb.watch/abcd/', 'https://fb.watch/abcd'],
  ['https://x.com/someone/status/1234567890', 'https://x.com/someone/status/1234567890'],
  ['https://mobile.twitter.com/someone/status/1', 'https://twitter.com/someone/status/1'],
  [
    'https://www.reddit.com/r/videos/comments/abc/title/',
    'https://reddit.com/r/videos/comments/abc/title',
  ],
  ['https://old.reddit.com/r/videos/comments/abc/', 'https://old.reddit.com/r/videos/comments/abc'],
  ['https://v.redd.it/xyz', 'https://v.redd.it/xyz'],
  ['https://vimeo.com/123456789', 'https://vimeo.com/123456789'],
  ['https://player.vimeo.com/video/123456789', 'https://player.vimeo.com/video/123456789'],
  ['https://youtube.com:443/watch?v=a', 'https://youtube.com/watch?v=a'],
  ['https://youtube.com/watch?z=1&v=a&fbclid=x', 'https://youtube.com/watch?v=a&z=1'],
];

const INVALID: [string, string][] = [
  ['', 'length'],
  [`https://youtube.com/watch?v=${'a'.repeat(2048)}`, 'length'],
  ['not a url', 'whitespace'],
  ['youtube.com/watch?v=a', 'not_a_url'],
  ['ftp://youtube.com/video', 'scheme'],
  ['javascript:alert(1)', 'scheme'],
  ['file:///etc/passwd', 'scheme'],
  ['data:text/html,hi', 'scheme'],
  ['https://user:pass@youtube.com/watch?v=a', 'credentials'],
  ['https://youtube.com:8080/watch?v=a', 'port'],
  ['https://127.0.0.1/video', 'ip_literal'],
  ['https://[::1]/video', 'ip_literal'],
  ['http://169.254.169.254/latest/meta-data/', 'ip_literal'],
  ['http://2130706433/', 'ip_literal'],
  ['http://0x7f000001/', 'ip_literal'],
  ['https://localhost/watch', 'local_host'],
  ['https://youtube.localhost/watch', 'local_host'],
  ['https://intranet/video', 'local_host'],
  ['https://printer.local/v', 'local_host'],
  ['https://example.com/video.mp4', 'not_allowlisted'],
  ['https://youtube.com.evil.example/watch', 'local_host'],
  ['https://notyoutube.com/watch?v=a', 'not_allowlisted'],
  ['https://youtube.co/watch?v=a', 'not_allowlisted'],
  ['https://evil.com/youtube.com', 'not_allowlisted'],
  ['https://xn--ytube-9ra.com/watch', 'not_allowlisted'],
  ['https://youtu.be/', 'no_video_id'],
  ['https://youtube.com/watch\n?v=a', 'whitespace'],
];

describe('checkUrl', () => {
  it('has at least 40 cases', () => {
    expect(VALID.length + INVALID.length).toBeGreaterThanOrEqual(40);
  });

  it.each(VALID)('accepts %s', (input, normalized) => {
    const r = checkUrl(input, allow);
    expect(r).toMatchObject({ ok: true, normalized });
  });

  it.each(INVALID)('rejects %j (%s)', (input, reason) => {
    expect(checkUrl(input, allow)).toEqual({ ok: false, reason });
  });

  it('derives the platform and flags short links', () => {
    expect(checkUrl('https://youtu.be/a', allow)).toMatchObject({ platform: 'youtube' });
    expect(checkUrl('https://twitter.com/a/status/1', allow)).toMatchObject({ platform: 'x' });
    expect(checkUrl('https://vm.tiktok.com/ZMabc/', allow)).toMatchObject({
      platform: 'tiktok',
      needsResolution: true,
    });
  });

  it('follows the instance allowlist setting', () => {
    expect(checkUrl('https://youtube.com/watch?v=a', ['vimeo.com'])).toEqual({
      ok: false,
      reason: 'not_allowlisted',
    });
  });
});

describe('SSRF guard', () => {
  it.each([
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.20.0.5', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['::1', false],
    ['fd00::1', false],
    ['fe80::1', false],
    ['::ffff:127.0.0.1', false],
    ['::ffff:7f00:1', false],
    ['::ffff:8.8.8.8', true],
    ['8.8.8.8', true],
    ['142.250.1.1', true],
    ['2001:4860:4860::8888', true],
  ])('isPublicAddress(%s) = %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it('rejects a host when any resolved address is private (DNS rebinding)', async () => {
    const lookup = async () => [
      { address: '142.250.1.1', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    await expect(assertPublicHost('youtube.com', lookup)).rejects.toBeInstanceOf(UrlRejected);
    await expect(
      assertPublicHost('youtube.com', async () => [{ address: '142.250.1.1', family: 4 }]),
    ).resolves.toBeUndefined();
    await expect(
      assertPublicHost('youtube.com', async () => Promise.reject(new Error('NXDOMAIN'))),
    ).rejects.toThrow(/dns_failed/);
  });

  it('resolves short links only through allowlisted public hops', async () => {
    const lookup = async () => [{ address: '142.250.1.1', family: 4 }];
    const redirectTo = (location: string) => async () => ({
      status: 301,
      headers: { get: () => location },
    });
    await expect(
      resolveShortLink('https://vm.tiktok.com/ZMabc/', allow, {
        lookup,
        fetch: redirectTo('https://www.tiktok.com/@u/video/123?_r=1'),
      }),
    ).resolves.toMatchObject({ ok: true, normalized: 'https://tiktok.com/@u/video/123' });
    await expect(
      resolveShortLink('https://vm.tiktok.com/ZMabc/', allow, {
        lookup,
        fetch: redirectTo('http://169.254.169.254/'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'ip_literal' });
    await expect(
      resolveShortLink('https://vm.tiktok.com/ZMabc/', allow, {
        lookup,
        fetch: redirectTo('https://vm.tiktok.com/again'),
      }),
    ).resolves.toEqual({ ok: false, reason: 'too_many_redirects' });
  });
});
