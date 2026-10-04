// Opaque tokens (LLD §5): 32 random bytes, base64url; stored only as SHA-256 digests (NFR-SEC-02).
import { createHash, randomBytes } from 'node:crypto';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
