// FR-AUTH-03 (BR-ACCT-2) and NFR-SEC-02.
import { describe, expect, it } from 'vitest';
import {
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from '../src/modules/auth/passwords.js';
import { ApiError } from '../src/http/errors.js';

function reason(password: string, username = 'sam'): string | null {
  try {
    checkPasswordPolicy(password, username);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return ((err as ApiError).details?.fields as Record<string, string>).password ?? null;
  }
}

describe('password policy', () => {
  it('rejects common passwords case-insensitively', () => {
    expect(reason('qwertyuiop')).toBe('password_common');
    expect(reason('Password123')).toBe('password_common');
    expect(reason('1234567890')).toBe('password_common');
  });
  it('rejects a password equal to the username', () => {
    expect(reason('samwise.gamgee', 'samwise.gamgee')).toBe('password_equals_username');
  });
  it('accepts long uncommon passwords without composition rules', () => {
    expect(reason('tangerine orbit forty two')).toBeNull();
  });
});

describe('argon2id hashing', () => {
  it('produces argon2id hashes with the OWASP parameters and verifies them', async () => {
    const hash = await hashPassword('tangerine-orbit-42');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'tangerine-orbit-42')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password-42')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});
