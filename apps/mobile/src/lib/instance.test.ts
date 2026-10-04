import { API_VERSION } from '@vidfriends/contracts';
import { isPrivateAddress, parseInstanceInput, verifyInstance } from './instance';

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
    ['http://192.168.1.20:8080', 'http://192.168.1.20:8080', null],
    ['http://10.0.2.2:8880/join/code_123-xyz', 'http://10.0.2.2:8880', 'code_123-xyz'],
  ])('accepts %s', (input, baseUrl, code) => {
    expect(parseInstanceInput(input)).toMatchObject({ baseUrl, inviteCode: code });
  });

  it.each([
    ['', 'empty'],
    ['ftp://example.org', 'invalid'],
    ['https://user:pw@example.org', 'invalid'],
    ['http://vids.example.org', 'insecure_public'],
    ['http://8.8.8.8', 'insecure_public'],
    ['http://printer.local', 'insecure_public'],
  ])('rejects %j as %s', (input, reason) => {
    expect(parseInstanceInput(input)).toBe(reason);
  });

  it('flags plain http on a private address as insecure', () => {
    expect(parseInstanceInput('http://172.20.0.5')).toMatchObject({ insecure: true });
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '::1',
    'fd12:3456::1',
    'fe80::1',
  ])('%s is private', (h) => expect(isPrivateAddress(h)).toBe(true));
  it.each(['172.32.0.1', '8.8.8.8', '192.169.0.1', '300.1.1.1', 'example.org', '2001:db8::1'])(
    '%s is not private',
    (h) => expect(isPrivateAddress(h)).toBe(false),
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
