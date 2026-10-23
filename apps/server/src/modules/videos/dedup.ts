// Perceptual media dedup (BR-MED-4, ADR-0022). A newly processed video may reuse the stored file
// of an earlier video that shows the same clip. Only the bytes are shared: each video keeps its
// own row, link, title, thumbnail, adders and shares, and nothing moves between members (L-19).
import { and, asc, between, eq, isNotNull, ne } from 'drizzle-orm';
import { videoFingerprints, videos } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import {
  decodeFingerprint,
  encodeFingerprint,
  sameClip,
  type Fingerprint,
} from '../../infra/media/fingerprint.js';

/** Durations may differ by this much (container and encoder rounding). */
export const DURATION_TOLERANCE = { minMs: 1000, fraction: 0.02 };
/** Aspect ratios may differ by this fraction. */
export const ASPECT_TOLERANCE = 0.03;
/** The reused file must have at least this fraction of the new video's height. */
export const MIN_HEIGHT_RATIO = 0.9;
const MAX_CANDIDATES = 200;

export interface ClipInfo {
  durationMs: number;
  width: number | null;
  height: number | null;
}

export interface Reusable {
  id: string;
  mediaKey: string;
  mediaBytes: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

function compatible(mine: ClipInfo, other: { width: number | null; height: number | null }) {
  if (!mine.width || !mine.height || !other.width || !other.height) return false;
  const a = mine.width / mine.height;
  const b = other.width / other.height;
  if (Math.abs(a - b) / b > ASPECT_TOLERANCE) return false;
  return other.height >= mine.height * MIN_HEIGHT_RATIO;
}

/** The earliest ready video whose stored file shows the same clip, if any. */
export async function findReusable(
  db: DbOrTx,
  videoId: string,
  fp: Fingerprint,
  info: ClipInfo,
): Promise<Reusable | null> {
  const tolerance = Math.max(
    DURATION_TOLERANCE.minMs,
    info.durationMs * DURATION_TOLERANCE.fraction,
  );
  const rows = await db
    .select({
      id: videos.id,
      mediaKey: videos.mediaKey,
      mediaBytes: videos.mediaBytes,
      durationMs: videos.durationMs,
      width: videos.width,
      height: videos.height,
      hashes: videoFingerprints.hashes,
      mask: videoFingerprints.mask,
    })
    .from(videoFingerprints)
    .innerJoin(videos, eq(videos.id, videoFingerprints.videoId))
    .where(
      and(
        ne(videos.id, videoId),
        eq(videos.state, 'ready'),
        isNotNull(videos.mediaKey),
        between(
          videoFingerprints.durationMs,
          Math.floor(info.durationMs - tolerance),
          Math.ceil(info.durationMs + tolerance),
        ),
      ),
    )
    .orderBy(asc(videos.readyAt), asc(videos.id))
    .limit(MAX_CANDIDATES);
  for (const r of rows) {
    if (!compatible(info, r)) continue;
    if (!sameClip(fp, decodeFingerprint(r.hashes, r.mask))) continue;
    return {
      id: r.id,
      mediaKey: r.mediaKey!,
      mediaBytes: r.mediaBytes,
      durationMs: r.durationMs,
      width: r.width,
      height: r.height,
    };
  }
  return null;
}

/**
 * Locks the candidate so retention cannot purge its file while this video starts using it.
 * Returns false when it is no longer ready with the same file.
 */
export async function lockReusable(tx: DbOrTx, r: Reusable): Promise<boolean> {
  const [row] = await tx
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.id, r.id), eq(videos.state, 'ready'), eq(videos.mediaKey, r.mediaKey)))
    .for('update');
  return Boolean(row);
}

export async function saveFingerprint(
  tx: DbOrTx,
  videoId: string,
  fp: Fingerprint,
  info: ClipInfo,
  now: Date,
) {
  const { hashes, mask } = encodeFingerprint(fp);
  await tx
    .insert(videoFingerprints)
    .values({
      videoId,
      durationMs: info.durationMs,
      width: info.width,
      height: info.height,
      hashes,
      mask,
      createdAt: now,
    })
    .onConflictDoNothing();
}

/** Whether another video still uses this stored file (so it must not be deleted). */
export async function fileStillUsed(tx: DbOrTx, mediaKey: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.mediaKey, mediaKey))
    .limit(1);
  return Boolean(row);
}
