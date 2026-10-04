// Password hashing and validation (BR-ACCT-2, NFR-SEC-02, LLD §5).
import { hash, verify } from '@node-rs/argon2';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fieldError } from '../../http/errors.js';

// argon2id, OWASP 2023 minimum: 19 MiB memory, 2 iterations, parallelism 1.
const ARGON2 = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

let denylist: Set<string> | null = null;
function commonPasswords(): Set<string> {
  if (!denylist) {
    const file = fileURLToPath(new URL('../../../assets/common-passwords.txt', import.meta.url));
    denylist = new Set(
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#')),
    );
  }
  return denylist;
}

/** Rules beyond length (enforced by the contract): not common, not equal to the username. */
export function checkPasswordPolicy(password: string, username: string, field = 'password'): void {
  const lower = password.toLowerCase();
  if (lower === username.toLowerCase()) throw fieldError(field, 'password_equals_username');
  if (commonPasswords().has(lower)) throw fieldError(field, 'password_common');
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Spend the same time as a real verification when the user does not exist. */
export async function verifyDummy(password: string): Promise<void> {
  dummy ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummy, password);
}
