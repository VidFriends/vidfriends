import { challengeFromDigest, handoffUrl, parseCallback, randomToken } from './handoff';

describe('browser hand-off (WF-AUTH-5)', () => {
  it('builds base64url tokens and challenges', () => {
    expect(randomToken(new Uint8Array([251, 255, 0, 1]))).toBe('-_8AAQ');
    // RFC 7636 appendix B: SHA-256 of the example verifier, base64.
    expect(challengeFromDigest('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw+cM=')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('opens the paired server page with state and challenge', () => {
    const url = new URL(
      handoffUrl('https://vids.example.org', {
        mode: 'join',
        state: 'abcdefghijklmnop',
        codeChallenge: 'c'.repeat(43),
        invite: 'INVITE_code-1',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://vids.example.org/app-auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: 'join',
      state: 'abcdefghijklmnop',
      code_challenge: 'c'.repeat(43),
      invite: 'INVITE_code-1',
    });
  });

  const code = 'A'.repeat(43);
  it('accepts only our callback with the expected state', () => {
    expect(parseCallback(`vidfriends://auth?code=${code}&state=s1`, 's1')).toBe(code);
    expect(parseCallback(`vidfriends://auth?code=${code}&state=s2`, 's1')).toBeNull();
    expect(parseCallback(`vidfriends://other?code=${code}&state=s1`, 's1')).toBeNull();
    expect(parseCallback(`https://evil.example/auth?code=${code}&state=s1`, 's1')).toBeNull();
    expect(parseCallback('vidfriends://auth?code=short&state=s1', 's1')).toBeNull();
    expect(parseCallback('vidfriends://auth?state=s1', 's1')).toBeNull();
  });
});
