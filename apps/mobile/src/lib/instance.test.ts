import { API_VERSION } from '@vidfriends/contracts';
import { isLoopback, parseInstanceInput, verifyInstance } from './instance';

describe('parseInstanceInput (WF-PAIR-1/3)', () => {
  it.each([
    ['https://vids.example.org', 'https://vids.example.org', null],
    ['vids.example.org', 'https://vids.example.org', null],
    ['https://vids.example.org/', 'https://vids.example.org', null],
    [
      'https://vids.example.org:8443/join/AbCdEf123456',
      'https://vids.example.org:8443',
      'AbCdEf123456',
    ],
    ['  https://vids.example.org/join/AbCdEf123456/  ', 'https://vids.example.org', 'AbCdEf123456'],
    ['http://localhost:8880/join/code_123-xyz', 'http://localhost:8880', 'code_123-xyz'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080', null],
  ])('accepts %s', (input, baseUrl, code) => {
    expect(parseInstanceInput(input)).toMatchObject({ baseUrl, inviteCode: code });
  });

  it.each([
    ['', 'empty'],
    ['ftp://example.org', 'invalid'],
    ['https://user:pw@example.org', 'invalid'],
    ['http://vids.example.org', 'insecure'],
    ['http://8.8.8.8', 'insecure'],
    ['http://printer.local', 'insecure'],
    // Passkeys need https: private addresses no longer qualify (ADR-0018).
    ['http://192.168.1.20:8080', 'insecure'],
    ['http://10.0.2.2:8880/join/code_123-xyz', 'insecure'],
  ])('rejects %j as %s', (input, reason) => {
    expect(parseInstanceInput(input)).toBe(reason);
  });
});

describe('isLoopback', () => {
  it.each(['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]'])('%s is loopback', (h) =>
    expect(isLoopback(h)).toBe(true),
  );
  it.each(['10.0.2.2', '192.168.0.1', 'fd12:3456::1', 'localhost.example.org', 'example.org'])(
    '%s is not loopback',
    (h) => expect(isLoopback(h)).toBe(false),
  );
});

describe('verifyInstance', () => {
  const info = {
    name: 'Home',
    version: '0.1.0',
    api_version: API_VERSION,
    signup_mode: 'invite_only',
    setup_complete: true,
    retention_days: 90,
  };
  const respond = (status: number, body: unknown) =>
    jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('accepts a VidFriends server with the same API major', async () => {
    const f = respond(200, info);
    await expect(verifyInstance('https://a.example', f)).resolves.toEqual({ ok: true, info });
    expect(f).toHaveBeenCalledWith('https://a.example/api/v1/instance', expect.anything());
  });
  it('rejects other servers, other API majors and network errors', async () => {
    await expect(verifyInstance('https://a.example', respond(200, { hello: 1 }))).resolves.toEqual({
      ok: false,
      reason: 'not_vidfriends',
    });
    await expect(
      verifyInstance('https://a.example', respond(200, { ...info, api_version: API_VERSION + 1 })),
    ).resolves.toEqual({ ok: false, reason: 'incompatible' });
    const failing = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(verifyInstance('https://a.example', failing)).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });
});
