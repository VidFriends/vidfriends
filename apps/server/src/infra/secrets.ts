// Instance secrets at rest (LLD §2 instance_secrets): AES-256-GCM with a key derived from APP_SECRET.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { instanceSecrets } from '../db/schema.js';
import type { DbOrTx } from './db.js';

function keyFor(appSecret: string, name: string): Buffer {
  return Buffer.from(hkdfSync('sha256', appSecret, 'vidfriends-instance-secrets', name, 32));
}

export function encryptSecret(appSecret: string, name: string, plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(appSecret, name), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(appSecret: string, name: string, blob: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', keyFor(appSecret, name), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}

/** Returns the stored secret, creating it with `create()` on first use (race-safe). */
export async function getOrCreateSecret(
  db: DbOrTx,
  appSecret: string,
  name: string,
  create: () => string,
): Promise<string> {
  const [row] = await db.select().from(instanceSecrets).where(eq(instanceSecrets.key, name));
  if (row) return decryptSecret(appSecret, name, row.ciphertext);
  await db
    .insert(instanceSecrets)
    .values({ key: name, ciphertext: encryptSecret(appSecret, name, create()) })
    .onConflictDoNothing();
  const [stored] = await db.select().from(instanceSecrets).where(eq(instanceSecrets.key, name));
  return decryptSecret(appSecret, name, stored!.ciphertext);
}
