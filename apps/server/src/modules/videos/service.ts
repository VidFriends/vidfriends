// Videos: add by link (WF-VID-1), upload (WF-VID-2), visibility (BR-SHR-6), media URLs (FR-VID-05),
// quota and storage cap (BR-MED-2, BR-MED-6).
import { MULTIPART_THRESHOLD_BYTES, type InstanceSettings } from '@vidfriends/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { uploads, users, videoAdditions, videos } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import { keys } from '../../infra/keys.js';
import { MAX_URL_TTL_SECONDS } from '../../infra/storage.js';
import { readLimited } from '../../infra/streams.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, fieldError, notFound } from '../../http/errors.js';
import { Reply } from '../../http/register.js';
import { requireStorage } from '../accounts/service.js';
import { getSettings } from '../settings/service.js';
import { toVideo, type VideoRow } from './serialize.js';
import { checkUrl, resolveShortLink, UrlRejected } from './url.js';

export const JOB_FETCH = 'video.fetch';
export const JOB_PROCESS = 'video.process';
export const MULTIPART_PART_BYTES = 16 * 1024 * 1024;
const UPLOAD_TTL_MS = 60 * 60 * 1000;

function requireQueue(deps: Deps) {
  if (!deps.queue) throw new ApiError('unavailable', 'Background jobs are not running');
  return deps.queue;
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  if (e?.code === '23505' && e.constraint === constraint) return true;
  return e?.cause ? isUniqueViolation(e.cause, constraint) : false;
}

/** BR-MED-2/6: per-user quota and instance cap, checked before accepting new media. */
export async function checkQuota(
  db: DbOrTx,
  settings: InstanceSettings,
  userId: string,
  extraBytes: number,
) {
  const [user] = await db
    .select({ storageBytes: users.storageBytes, override: users.quotaBytesOverride })
    .from(users)
    .where(eq(users.id, userId));
  const quota = user?.override ?? settings.per_user_quota_bytes;
  if (quota !== null && (user?.storageBytes ?? 0) + extraBytes > quota) {
    throw new ApiError('quota_exceeded', 'You have used all your storage', { quota_bytes: quota });
  }
  if (settings.instance_storage_cap_bytes !== null) {
    const [{ total } = { total: 0 }] = await db
      .select({ total: sql<number>`coalesce(sum(${users.storageBytes}), 0)::bigint` })
      .from(users);
    if (Number(total) + extraBytes > settings.instance_storage_cap_bytes) {
      throw new ApiError('storage_full', 'This server is out of storage space');
    }
  }
}

/** Remaining bytes a member may still store (null = unlimited). */
export async function remainingQuota(
  db: DbOrTx,
  settings: InstanceSettings,
  userId: string | null,
): Promise<number | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ storageBytes: users.storageBytes, override: users.quotaBytesOverride })
    .from(users)
    .where(eq(users.id, userId));
  const quota = user?.override ?? settings.per_user_quota_bytes;
  return quota === null ? null : Math.max(0, quota - (user?.storageBytes ?? 0));
}

async function recordAddition(db: DbOrTx, videoId: string, userId: string, now: Date) {
  await db.insert(videoAdditions).values({ videoId, userId, createdAt: now }).onConflictDoNothing();
}

/** WF-VID-1. Returns 201 for a new video, 200 when an existing one is reused (BR-MED-4). */
export async function addLink(deps: Deps, viewer: Viewer, input: string) {
  const settings = await getSettings(deps.db);
  let check = checkUrl(input, settings.platform_allowlist);
  if (check.ok && check.needsResolution) {
    try {
      check = await resolveShortLink(check.url, settings.platform_allowlist, deps.net);
    } catch (err) {
      check = {
        ok: false,
        reason: err instanceof UrlRejected ? err.reason : 'short_link_unresolved',
      };
    }
  }
  if (!check.ok) {
    throw new ApiError('url_not_allowed', 'That link is not from a supported site', {
      reason: check.reason,
    });
  }
  const link = check;
  const queue = requireQueue(deps);

  const attempt = async () =>
    deps.db.transaction(async (tx) => {
      const now = deps.clock.now();
      const [existing] = await tx
        .select()
        .from(videos)
        .where(eq(videos.normalizedUrl, link.normalized))
        .for('update');
      if (existing) {
        if (existing.state === 'expired' || existing.state === 'failed') {
          // Media was purged or never worked: fetch again (quota applies to the new copy).
          await checkQuota(tx, settings, viewer.id, 0);
          const [again] = await tx
            .update(videos)
            .set({
              state: 'queued',
              failureReason: null,
              addedBy: existing.addedBy ?? viewer.id,
              updatedAt: now,
            })
            .where(eq(videos.id, existing.id))
            .returning();
          await recordAddition(tx, existing.id, viewer.id, now);
          await queue.send(
            JOB_FETCH,
            { video_id: existing.id, attempt: 1 },
            { tx, singletonKey: `fetch:${existing.id}` },
          );
          return new Reply(200, { video: toVideo(again as VideoRow) });
        }
        await recordAddition(tx, existing.id, viewer.id, now);
        return new Reply(200, { video: toVideo(existing) });
      }
      await checkQuota(tx, settings, viewer.id, 0);
      const [video] = await tx
        .insert(videos)
        .values({
          id: newId(),
          addedBy: viewer.id,
          sourceKind: 'link',
          sourceUrl: input.trim().slice(0, 2048),
          normalizedUrl: link.normalized,
          platform: link.platform,
          state: 'queued',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await recordAddition(tx, video!.id, viewer.id, now);
      // Same transaction as the insert: a committed video always has its job (SDD §4).
      await queue.send(
        JOB_FETCH,
        { video_id: video!.id, attempt: 1 },
        { tx, singletonKey: `fetch:${video!.id}` },
      );
      return new Reply(201, { video: toVideo(video!) });
    });

  try {
    return await attempt();
  } catch (err) {
    // Two members adding the same link at once: the loser reuses the winner's video.
    if (isUniqueViolation(err, 'videos_normalized_url_key')) return attempt();
    throw err;
  }
}

/** FR-VID-03: size and quota are checked before any bytes are accepted. */
export async function createUpload(deps: Deps, viewer: Viewer, bytes: number, contentType: string) {
  const storage = requireStorage(deps);
  const settings = await getSettings(deps.db);
  if (bytes > settings.max_media_bytes) {
    throw new ApiError('too_large', 'That file is too large', {
      max_bytes: settings.max_media_bytes,
    });
  }
  await checkQuota(deps.db, settings, viewer.id, bytes);
  const id = newId();
  const key = keys.upload(id);
  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS);
  let putUrl: string | null = null;
  let multipart: { part_size: number; part_urls: string[] } | null = null;
  let multipartId: string | null = null;
  if (bytes <= MULTIPART_THRESHOLD_BYTES) {
    putUrl = await storage.presignPut(key, contentType, bytes, MAX_URL_TTL_SECONDS);
  } else {
    multipartId = await storage.createMultipart(key, contentType);
    const count = Math.ceil(bytes / MULTIPART_PART_BYTES);
    const urls: string[] = [];
    for (let n = 1; n <= count; n++)
      urls.push(await storage.presignPart(key, multipartId, n, MAX_URL_TTL_SECONDS));
    multipart = { part_size: MULTIPART_PART_BYTES, part_urls: urls };
  }
  await deps.db.insert(uploads).values({
    id,
    userId: viewer.id,
    objectKey: key,
    declaredBytes: bytes,
    contentType,
    multipartId,
    expiresAt,
    createdAt: now,
  });
  return { upload_id: id, put_url: putUrl, multipart, expires_at: expiresAt.toISOString() };
}

/** Content sniffing (NFR-SEC-08): ISO-BMFF (`ftyp`) or Matroska/WebM (EBML) only. */
export function sniffVideo(head: Buffer): boolean {
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') return true;
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return true;
  return false;
}

async function sha256Of(stream: AsyncIterable<Buffer | Uint8Array>): Promise<Buffer> {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest();
}

/** WF-VID-2: verify, sniff, hash, dedup (BR-MED-4), then queue processing. */
export async function completeUpload(
  deps: Deps,
  viewer: Viewer,
  uploadId: string,
  input: {
    title?: string | undefined;
    parts?: { part_number: number; etag: string }[] | undefined;
  },
) {
  const [upload] = await deps.db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  if (!upload || upload.userId !== viewer.id) throw notFound();
  const storage = requireStorage(deps);
  const queue = requireQueue(deps);
  if (upload.state === 'completed' && upload.videoId) {
    const [video] = await deps.db.select().from(videos).where(eq(videos.id, upload.videoId));
    if (video) return new Reply(200, { video: toVideo(video) });
  }
  if (upload.state !== 'pending' || upload.expiresAt <= deps.clock.now()) {
    throw new ApiError('upload_incomplete', 'This upload has expired. Start again.');
  }
  if (upload.multipartId) {
    if (!input.parts?.length) throw new ApiError('upload_incomplete', 'Missing upload parts');
    try {
      await storage.completeMultipart(
        upload.objectKey,
        upload.multipartId,
        input.parts.map((p) => ({ partNumber: p.part_number, etag: p.etag })),
      );
    } catch {
      throw new ApiError('upload_incomplete', 'The upload did not finish');
    }
  }
  const head = await storage.headObject(upload.objectKey);
  if (!head || head.size === 0)
    throw new ApiError('upload_incomplete', 'The upload did not finish');
  const discard = async () => {
    await deps.db.update(uploads).set({ state: 'aborted' }).where(eq(uploads.id, upload.id));
    await storage.deleteObjects([upload.objectKey]).catch(() => {});
  };
  if (head.size > upload.declaredBytes) {
    await discard();
    throw new ApiError('too_large', 'The uploaded file is larger than announced');
  }
  const first = await readLimited(await storage.getObject(upload.objectKey, 'bytes=0-4095'), 8192);
  if (!sniffVideo(first)) {
    await discard();
    throw fieldError('upload_id', 'not_a_video', 'That file is not a video we can use');
  }
  const sha256 = await sha256Of(await storage.getObject(upload.objectKey));
  const settings = await getSettings(deps.db);

  return deps.db.transaction(async (tx) => {
    const now = deps.clock.now();
    const [dup] = await tx.select().from(videos).where(eq(videos.sha256, sha256)).for('update');
    if (dup && dup.state !== 'expired' && dup.state !== 'failed') {
      // Exact duplicate: reuse the media only (BR-MED-4).
      await recordAddition(tx, dup.id, viewer.id, now);
      await tx
        .update(uploads)
        .set({ state: 'completed', videoId: dup.id })
        .where(eq(uploads.id, upload.id));
      await storage.deleteObjects([upload.objectKey]).catch(() => {});
      return new Reply(200, { video: toVideo(dup) });
    }
    await checkQuota(tx, settings, viewer.id, head.size);
    const values = {
      addedBy: viewer.id,
      sourceKind: 'upload' as const,
      sha256,
      state: 'processing' as const,
      failureReason: null,
      title: (input.title ?? '').slice(0, 200),
      updatedAt: now,
    };
    const [video] = dup
      ? await tx.update(videos).set(values).where(eq(videos.id, dup.id)).returning()
      : await tx
          .insert(videos)
          .values({ id: newId(), createdAt: now, ...values })
          .returning();
    await recordAddition(tx, video!.id, viewer.id, now);
    await tx
      .update(uploads)
      .set({ state: 'completed', videoId: video!.id })
      .where(eq(uploads.id, upload.id));
    await queue.send(
      JOB_PROCESS,
      { video_id: video!.id, source_key: upload.objectKey },
      { tx, singletonKey: `process:${video!.id}` },
    );
    return new Reply(201, { video: toVideo(video!) });
  });
}

/**
 * BR-SHR-6: a member sees a video they added, or one in a share where they are a participant.
 * Returns the row or throws 404 (BR-GEN-3).
 */
export async function visibleVideo(deps: Deps, viewer: Viewer, videoId: string): Promise<VideoRow> {
  const rows = await deps.db
    .select({ video: videos })
    .from(videos)
    .where(and(eq(videos.id, videoId), videoVisibleSql(viewer.id)))
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0].video;
}

/** The SQL visibility predicate for `videos` (SDD §3 layer 3). */
export function videoVisibleSql(viewerId: string) {
  return sql`exists (select 1 from video_additions va where va.video_id = ${videos.id} and va.user_id = ${viewerId}::uuid)`;
}

/** Signed URLs (≤ 15 min) for playable media and thumbnails (BR-MED-7). */
export async function mediaUrls(deps: Deps, video: VideoRow) {
  const storage = requireStorage(deps);
  const expiresAt = new Date(deps.clock.now().getTime() + MAX_URL_TTL_SECONDS * 1000);
  if (video.state === 'ready' && video.mediaKey) {
    return {
      media_url: await storage.presignGet(video.mediaKey),
      thumb_url: video.thumbKey ? await storage.presignGet(video.thumbKey) : null,
      expires_at: expiresAt.toISOString(),
    };
  }
  if (video.state === 'link_only' || video.state === 'expired') {
    return {
      media_url: null,
      thumb_url: video.thumbKey ? await storage.presignGet(video.thumbKey) : null,
      expires_at: expiresAt.toISOString(),
    };
  }
  throw new ApiError('not_playable', 'This video is not ready yet');
}

export async function listByIds(db: DbOrTx, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(videos).where(inArray(videos.id, ids));
}
