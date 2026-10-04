// Media jobs (SDD §4, LLD §4, FR-VID-02/04/09, BR-MED-2/3/8/9). Handlers are idempotent: each
// checks the current state first, uploads to storage before committing, and deletes after commit.
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Job } from 'pg-boss';
import { users, videos } from '../db/schema.js';
import { NotAnImageError, toWebpWidth } from '../infra/images.js';
import { keys } from '../infra/keys.js';
import {
  normalise,
  probe,
  thumbnail,
  UnplayableMediaError,
  type FfmpegOptions,
} from '../infra/media/ffmpeg.js';
import { fingerprint } from '../infra/media/fingerprint.js';
import { download, probeMetadata } from '../infra/media/ytdlp.js';
import type { DbOrTx } from '../infra/db.js';
import type { Deps } from '../http/deps.js';
import { getSettings } from '../modules/settings/service.js';
import { emitBecamePlayable } from '../modules/videos/events.js';
import type { VideoRow } from '../modules/videos/serialize.js';
import { findReusable, lockReusable, saveFingerprint } from '../modules/videos/dedup.js';
import { JOB_FETCH, JOB_PROCESS, remainingQuota } from '../modules/videos/service.js';
import { assertPublicHost, checkUrl, UrlRejected } from '../modules/videos/url.js';

/** BR-MED-3: retry 3 times with backoff 1 m, 5 m, 30 m, then fall back to link-only. */
export const FETCH_RETRY_DELAYS_SECONDS = [60, 300, 1800];
export const PROCESS_RETRY_LIMIT = 2;

export interface FetchJob {
  video_id: string;
  attempt: number;
}
export interface ProcessJob {
  video_id: string;
  source_key: string;
}

async function loadVideo(deps: Deps, id: string): Promise<VideoRow | null> {
  const [v] = await deps.db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return v ?? null;
}

function ffmpegOptions(deps: Deps): FfmpegOptions {
  return {
    ffmpeg: deps.env.FFMPEG_PATH,
    ffprobe: deps.env.FFPROBE_PATH,
    timeoutMs: deps.env.PROCESS_TIMEOUT_SECONDS * 1000,
  };
}

async function workDir(deps: Deps, prefix: string): Promise<string> {
  await mkdir(deps.env.WORK_DIR, { recursive: true });
  return mkdtemp(join(deps.env.WORK_DIR, `${prefix}-`));
}

async function storeThumbnail(
  deps: Deps,
  videoId: string,
  imageFile: string,
): Promise<string | null> {
  try {
    const webp = await toWebpWidth(await readFile(imageFile), 720);
    const key = keys.thumb(videoId);
    await deps.storage!.putObject(key, webp, 'image/webp', webp.length);
    return key;
  } catch (err) {
    if (err instanceof NotAnImageError) return null;
    throw err;
  }
}

/** Ends a link in `link_only`, keeping whatever metadata a skip-download probe can find. */
async function finishLinkOnly(
  deps: Deps,
  video: VideoRow,
  reason: string | null,
  tryProbe: boolean,
) {
  let patch: Partial<VideoRow> = {};
  if (tryProbe && video.normalizedUrl) {
    const dir = await workDir(deps, `probe-${video.id}`);
    try {
      await assertPublicHost(new URL(video.normalizedUrl).hostname, deps.net.lookup);
      const meta = await probeMetadata(video.normalizedUrl, dir, {
        binary: deps.env.YTDLP_PATH,
        proxy: deps.env.FETCH_PROXY_URL,
        timeoutMs: 60_000,
      });
      if (meta) {
        patch = {
          title: video.title || meta.title,
          authorHandle: video.authorHandle ?? meta.authorHandle,
          durationMs:
            meta.durationSeconds !== null ? Math.round(meta.durationSeconds * 1000) : null,
        };
        if (meta.thumbnail) patch.thumbKey = await storeThumbnail(deps, video.id, meta.thumbnail);
      }
    } catch (err) {
      if (!(err instanceof UrlRejected))
        deps.log.warn({ video_id: video.id, err }, 'metadata probe failed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  await deps.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(videos)
      .set({ ...patch, state: 'link_only', failureReason: reason, updatedAt: deps.clock.now() })
      .where(
        sql`${videos.id} = ${video.id} and ${videos.state} in ('queued','fetching','processing')`,
      )
      .returning({ id: videos.id });
    if (updated) await emitBecamePlayable(deps, tx, video.id);
  });
  deps.log.info({ video_id: video.id, reason }, 'video is link-only');
}

export async function handleFetch(deps: Deps, job: Job<FetchJob>): Promise<void> {
  const { video_id: id, attempt } = job.data;
  const video = await loadVideo(deps, id);
  if (!video || (video.state !== 'queued' && video.state !== 'fetching')) return; // idempotent
  const settings = await getSettings(deps.db);

  // BR-MED-9: conservative legal mode — never download, keep metadata where possible.
  if (!settings.link_download_enabled)
    return finishLinkOnly(deps, video, 'downloads_disabled', true);

  const check = checkUrl(video.normalizedUrl ?? '', settings.platform_allowlist);
  if (!check.ok) return finishLinkOnly(deps, video, 'url_not_allowed', false);
  try {
    await assertPublicHost(check.host, deps.net.lookup);
  } catch (err) {
    if (err instanceof UrlRejected && err.reason === 'private_address') {
      return finishLinkOnly(deps, video, 'url_not_allowed', false);
    }
    return retryOrGiveUp(deps, video, attempt, 'dns_failed');
  }

  const remaining = await remainingQuota(deps.db, settings, video.addedBy);
  if (remaining !== null && remaining <= 0)
    return finishLinkOnly(deps, video, 'quota_exceeded', true);
  const maxBytes = Math.min(settings.max_media_bytes, remaining ?? Number.MAX_SAFE_INTEGER);

  await deps.db
    .update(videos)
    .set({ state: 'fetching', updatedAt: deps.clock.now() })
    .where(eq(videos.id, id));
  const dir = await workDir(deps, `fetch-${id}`);
  try {
    const outcome = await download(check.url, dir, {
      binary: deps.env.YTDLP_PATH,
      proxy: deps.env.FETCH_PROXY_URL,
      timeoutMs: deps.env.FETCH_TIMEOUT_SECONDS * 1000,
      maxBytes,
      maxDurationSeconds: settings.max_duration_seconds,
    });
    if (outcome.kind === 'too_large') return await finishLinkOnly(deps, video, 'too_large', true);
    if (outcome.kind === 'too_long') return await finishLinkOnly(deps, video, 'too_long', true);
    if (outcome.kind === 'unsupported')
      return await finishLinkOnly(deps, video, 'unsupported', true);
    if (outcome.kind === 'error') {
      deps.log.warn({ video_id: id, attempt, reason: outcome.message }, 'fetch failed');
      return await retryOrGiveUp(
        deps,
        video,
        attempt,
        outcome.timedOut ? 'timeout' : 'fetch_failed',
      );
    }
    const { media } = outcome;
    const sourceKey = keys.fetchSource(id);
    // Storage first, then the commit that enqueues processing (SDD §4 side-effect order).
    await deps.storage!.putObject(
      sourceKey,
      createReadStream(media.file),
      'application/octet-stream',
      media.bytes,
    );
    await deps.db.transaction(async (tx) => {
      await tx
        .update(videos)
        .set({
          state: 'processing',
          title: video.title || media.title,
          authorHandle: media.authorHandle,
          updatedAt: deps.clock.now(),
        })
        .where(eq(videos.id, id));
      await deps.queue!.send(
        JOB_PROCESS,
        { video_id: id, source_key: sourceKey },
        { tx, singletonKey: `process:${id}` },
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function retryOrGiveUp(deps: Deps, video: VideoRow, attempt: number, reason: string) {
  const delay = FETCH_RETRY_DELAYS_SECONDS[attempt - 1];
  if (delay === undefined) return finishLinkOnly(deps, video, reason, true);
  await deps.db.transaction(async (tx) => {
    await tx
      .update(videos)
      .set({ state: 'queued', updatedAt: deps.clock.now() })
      .where(eq(videos.id, video.id));
    await deps.queue!.send(
      JOB_FETCH,
      { video_id: video.id, attempt: attempt + 1 },
      { tx, startAfter: delay, singletonKey: `fetch:${video.id}:${attempt + 1}` },
    );
  });
}

async function hashFile(file: string): Promise<Buffer> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest();
}

/** Exact-hash dedup only applies to uploads (BR-MED-4); a link whose bytes match keeps its own row. */
async function uniqueSha(tx: DbOrTx, id: string, sha256: Buffer): Promise<Buffer | null> {
  const [taken] = await tx
    .select({ id: videos.id })
    .from(videos)
    .where(sql`${videos.sha256} = ${sha256} and ${videos.id} <> ${id}`);
  return taken ? null : sha256;
}

export async function handleProcess(deps: Deps, job: Job<ProcessJob>): Promise<void> {
  const { video_id: id, source_key: sourceKey } = job.data;
  const video = await loadVideo(deps, id);
  if (!video || video.state !== 'processing') {
    // Already done (or gone): make sure the source does not linger.
    if (video?.state === 'ready') await deps.storage!.deleteObjects([sourceKey]).catch(() => {});
    return;
  }
  const settings = await getSettings(deps.db);
  const dir = await workDir(deps, `process-${id}`);
  const opts = ffmpegOptions(deps);
  try {
    const source = join(dir, 'source');
    await pipeline(await deps.storage!.getObject(sourceKey), createWriteStream(source));
    const sha256 = video.sha256 ?? (await hashFile(source));
    let info;
    try {
      info = await probe(source, opts);
    } catch (err) {
      if (err instanceof UnplayableMediaError)
        return await processFailed(deps, video, sourceKey, 'unplayable');
      throw err;
    }
    if (info.durationSeconds !== null && info.durationSeconds > settings.max_duration_seconds) {
      return await processFailed(deps, video, sourceKey, 'too_long');
    }
    const out = join(dir, 'main.mp4');
    let thumbFile: string;
    try {
      await normalise(source, out, info, opts);
      thumbFile = await thumbnail(out, dir, info.durationSeconds, opts);
    } catch (err) {
      if (err instanceof UnplayableMediaError)
        return await processFailed(deps, video, sourceKey, 'unplayable');
      throw err;
    }
    const durationMs =
      info.durationSeconds !== null ? Math.round(info.durationSeconds * 1000) : null;
    const clip = { durationMs: durationMs ?? 0, width: info.width, height: info.height };
    // Perceptual dedup (BR-MED-4, ADR-0022): reuse an earlier video's file for the same clip.
    const fp =
      deps.env.MEDIA_DEDUP === 'perceptual' && durationMs
        ? await fingerprint(out, dir, info.durationSeconds, opts).catch(() => null)
        : null;
    const candidate = fp ? await findReusable(deps.db, id, fp, clip) : null;
    const thumbKey = await storeThumbnail(deps, id, thumbFile);
    const now = deps.clock.now();
    const common = {
      state: 'ready' as const,
      thumbKey,
      readyAt: now,
      updatedAt: now,
    };

    let bytes = 0;
    let reusedFrom: string | null = null;
    if (candidate) {
      const reused = await deps.db.transaction(async (tx) => {
        if (!(await lockReusable(tx, candidate))) return false;
        const [updated] = await tx
          .update(videos)
          .set({
            ...common,
            mediaKey: candidate.mediaKey,
            mediaReused: true,
            mediaBytes: candidate.mediaBytes,
            // The file is the earlier video's, so its properties describe what plays.
            durationMs: candidate.durationMs,
            width: candidate.width,
            height: candidate.height,
            sha256: await uniqueSha(tx, id, sha256),
          })
          .where(sql`${videos.id} = ${id} and ${videos.state} = 'processing'`)
          .returning({ id: videos.id });
        if (!updated) return true;
        // Nothing new is stored, so nobody is charged (BR-MED-6).
        await saveFingerprint(tx, id, fp!, clip, now);
        await emitBecamePlayable(deps, tx, id);
        return true;
      });
      if (reused) {
        bytes = candidate.mediaBytes;
        reusedFrom = candidate.id;
      }
    }
    if (!reusedFrom) {
      bytes = (await stat(out)).size;
      const mediaKey = keys.media(id);
      await deps.storage!.putObject(mediaKey, createReadStream(out), 'video/mp4', bytes);
      await deps.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(videos)
          .set({
            ...common,
            mediaKey,
            mediaBytes: bytes,
            durationMs,
            width: info.width,
            height: info.height,
            sha256: await uniqueSha(tx, id, sha256),
          })
          .where(sql`${videos.id} = ${id} and ${videos.state} = 'processing'`)
          .returning({ addedBy: videos.addedBy });
        if (!updated) return;
        // Storage accounting in the same transaction (LLD §2, BR-MED-6).
        if (updated.addedBy) {
          await tx
            .update(users)
            .set({ storageBytes: sql`${users.storageBytes} + ${bytes}` })
            .where(eq(users.id, updated.addedBy));
        }
        if (fp) await saveFingerprint(tx, id, fp, clip, now);
        await emitBecamePlayable(deps, tx, id);
      });
    }
    await deps.storage!.deleteObjects([sourceKey]).catch(() => {});
    deps.log.info({ video_id: id, bytes, reused_from: reusedFrom }, 'video ready');
  } catch (err) {
    if (job.retryCount >= PROCESS_RETRY_LIMIT) {
      deps.log.error({ video_id: id, err }, 'processing failed after retries');
      return processFailed(deps, video, sourceKey, 'processing_failed');
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Uploads end in `failed`; links fall back to `link_only` (LLD §4). */
async function processFailed(deps: Deps, video: VideoRow, sourceKey: string, reason: string) {
  if (video.sourceKind === 'link') {
    await finishLinkOnly(deps, video, reason, true);
  } else {
    await deps.db
      .update(videos)
      .set({ state: 'failed', failureReason: reason, updatedAt: deps.clock.now() })
      .where(sql`${videos.id} = ${video.id} and ${videos.state} = 'processing'`);
  }
  await deps.storage!.deleteObjects([sourceKey]).catch(() => {});
}
