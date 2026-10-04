// Profile (WF-ACCT-1, BR-ACCT-3, FR-ACCT-01).
import { AVATAR_MAX_BYTES } from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { NotAnImageError, toSquareWebp } from '../../infra/images.js';
import { keys } from '../../infra/keys.js';
import type { Storage } from '../../infra/storage.js';
import { readLimited } from '../../infra/streams.js';
import { newToken } from '../../infra/tokens.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, fieldError, notFound } from '../../http/errors.js';
import { getRelationship } from '../friends/policy.js';

const UPLOAD_TTL_SECONDS = 10 * 60;

export function requireStorage(deps: Deps): Storage {
  if (!deps.storage) throw new ApiError('unavailable', 'Media storage is not configured');
  return deps.storage;
}

export async function loadUser(deps: Deps, id: string) {
  const [user] = await deps.db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new ApiError('unauthorized');
  return user;
}

export async function updateDisplayName(deps: Deps, viewer: Viewer, displayName: string) {
  const [user] = await deps.db
    .update(users)
    .set({ displayName, updatedAt: deps.clock.now() })
    .where(eq(users.id, viewer.id))
    .returning();
  if (!user) throw new ApiError('unauthorized');
  return user;
}

export async function createAvatarUpload(
  deps: Deps,
  viewer: Viewer,
  bytes: number,
  contentType: string,
) {
  const storage = requireStorage(deps);
  const uploadId = newToken();
  const putUrl = await storage.presignPut(
    keys.avatarUpload(viewer.id, uploadId),
    contentType,
    bytes,
    UPLOAD_TTL_SECONDS,
  );
  return {
    upload_id: uploadId,
    put_url: putUrl,
    expires_at: new Date(deps.clock.now().getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
  };
}

/** Re-encodes the uploaded bytes to a 256×256 WebP; the original is never served (NFR-SEC-08). */
export async function setAvatar(deps: Deps, viewer: Viewer, uploadId: string) {
  const storage = requireStorage(deps);
  if (!/^[A-Za-z0-9_-]{43}$/.test(uploadId))
    throw new ApiError('upload_incomplete', 'Upload not found');
  const tmpKey = keys.avatarUpload(viewer.id, uploadId);
  const head = await storage.headObject(tmpKey);
  if (!head) throw new ApiError('upload_incomplete', 'Upload not found');
  try {
    if (head.size > AVATAR_MAX_BYTES)
      throw new ApiError('too_large', 'Avatars can be at most 2 MB');
    const original = await readLimited(await storage.getObject(tmpKey), AVATAR_MAX_BYTES);
    let webp: Buffer;
    try {
      webp = await toSquareWebp(original, 256);
    } catch (err) {
      if (err instanceof NotAnImageError)
        throw fieldError('upload_id', 'not_an_image', 'That file is not an image');
      throw err;
    }
    const before = await loadUser(deps, viewer.id);
    const key = keys.avatar(
      viewer.id,
      deps.clock.now().getTime().toString(36) + newToken().slice(0, 6),
    );
    await storage.putObject(key, webp, 'image/webp', webp.length);
    const [user] = await deps.db
      .update(users)
      .set({ avatarKey: key, updatedAt: deps.clock.now() })
      .where(eq(users.id, viewer.id))
      .returning();
    // Storage deletes happen after the database commit (SDD §4).
    if (before.avatarKey) await storage.deleteObjects([before.avatarKey]).catch(() => {});
    return user!;
  } finally {
    await storage.deleteObjects([tmpKey]).catch(() => {});
  }
}

export async function deleteAvatar(deps: Deps, viewer: Viewer) {
  const before = await loadUser(deps, viewer.id);
  const [user] = await deps.db
    .update(users)
    .set({ avatarKey: null, updatedAt: deps.clock.now() })
    .where(eq(users.id, viewer.id))
    .returning();
  if (before.avatarKey && deps.storage)
    await deps.storage.deleteObjects([before.avatarKey]).catch(() => {});
  return user!;
}

/** Avatars are visible to members who can see the user: active, and no block either way. */
export async function avatarRedirect(deps: Deps, viewer: Viewer, userId: string): Promise<string> {
  const storage = requireStorage(deps);
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.avatarKey) throw notFound();
  if (user.id !== viewer.id) {
    if (user.status !== 'active') throw notFound();
    const rel = await getRelationship(deps.db, viewer.id, userId);
    if (rel?.state === 'blocked') throw notFound();
  }
  return storage.presignGet(user.avatarKey, 15 * 60);
}
