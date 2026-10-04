// Scheduled maintenance (SDD §4): retention.purge (daily + manual), storage.sweep (weekly),
// session.cleanup (hourly housekeeping) and account.purge_media (after deletion).
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Job } from 'pg-boss';
import {
  auditLog,
  exports,
  notifications,
  sendRequests,
  uploads,
  users,
  videos,
} from '../db/schema.js';
import { DAY, HOUR } from '../infra/clock.js';
import { KEY_PREFIXES } from '../infra/keys.js';
import type { Deps } from '../http/deps.js';
import { purgeResets } from '../modules/admin/service.js';
import { deleteExpiredSessions } from '../modules/auth/sessions.js';
import { expireExports } from '../modules/exports/service.js';
import { getSettings } from '../modules/settings/service.js';

export const JOB_SWEEP = 'storage.sweep';
export const JOB_CLEANUP = 'session.cleanup';
export const NOTIFICATION_RETENTION_MS = 90 * DAY; // BR-NOT-5
export const AUDIT_RETENTION_MS = 365 * DAY; // WF-ADM-6
/** Objects younger than this are never treated as orphans (storage put happens before commit). */
export const ORPHAN_GRACE_MS = HOUR;

/**
 * BR-MED-5: purge the media file when no share is saved and every share was watched (or, if
 * unwatched, created) more than `retention_days` ago. A video nobody shared expires 24 h after it
 * was added. Metadata and the thumbnail stay; the state becomes `expired`.
 */
export async function runRetention(
  deps: Deps,
): Promise<{ expired: number; notifications: number; audit: number }> {
  const now = deps.clock.now();
  const settings = await getSettings(deps.db);
  let expired = 0;
  if (settings.retention_days > 0) {
    const cutoff = new Date(now.getTime() - settings.retention_days * DAY);
    const unsharedCutoff = new Date(now.getTime() - DAY);
    const eligible = await deps.db
      .select({ id: videos.id })
      .from(videos)
      .where(
        and(
          eq(videos.state, 'ready'),
          sql`not exists (select 1 from shares s where s.video_id = ${videos.id} and s.saved)`,
          sql`not exists (select 1 from shares s where s.video_id = ${videos.id} and coalesce(s.watched_at, s.created_at) >= ${cutoff})`,
          sql`(exists (select 1 from shares s where s.video_id = ${videos.id}) or ${videos.createdAt} < ${unsharedCutoff})`,
        ),
      );
    for (const { id } of eligible) {
      const purged = await deps.db.transaction(async (tx) => {
        const [v] = await tx
          .select()
          .from(videos)
          .where(and(eq(videos.id, id), eq(videos.state, 'ready')))
          .for('update');
        if (!v) return null;
        await tx
          .update(videos)
          .set({ state: 'expired', expiredAt: now, mediaKey: null, mediaBytes: 0, updatedAt: now })
          .where(eq(videos.id, id));
        // Bytes are released when the file is purged (BR-MED-6), in the same transaction.
        if (v.addedBy && v.mediaBytes > 0) {
          await tx
            .update(users)
            .set({ storageBytes: sql`greatest(0, ${users.storageBytes} - ${v.mediaBytes})` })
            .where(eq(users.id, v.addedBy));
        }
        return v;
      });
      if (!purged) continue;
      expired += 1;
      // Storage deletes happen after the database commit (SDD §4); the thumbnail stays.
      if (purged.mediaKey && deps.storage)
        await deps.storage.deleteObjects([purged.mediaKey]).catch(() => {});
    }
  }
  const notificationsPurged = await deps.db
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(now.getTime() - NOTIFICATION_RETENTION_MS)))
    .returning({ id: notifications.id });
  const auditPurged = await deps.db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, new Date(now.getTime() - AUDIT_RETENTION_MS)))
    .returning({ id: auditLog.id });
  deps.log.info(
    { expired, notifications: notificationsPurged.length, audit: auditPurged.length },
    'retention run',
  );
  return { expired, notifications: notificationsPurged.length, audit: auditPurged.length };
}

/** Lists the bucket against the database and removes objects nothing references (NFR-REL-05). */
export async function runSweep(deps: Deps): Promise<{ scanned: number; deleted: string[] }> {
  const storage = deps.storage;
  if (!storage) return { scanned: 0, deleted: [] };
  const now = deps.clock.now().getTime();
  const referenced = new Set<string>();
  for (const v of await deps.db.select({ m: videos.mediaKey, t: videos.thumbKey }).from(videos)) {
    if (v.m) referenced.add(v.m);
    if (v.t) referenced.add(v.t);
  }
  for (const u of await deps.db.select({ a: users.avatarKey }).from(users))
    if (u.a) referenced.add(u.a);
  for (const e of await deps.db.select({ k: exports.objectKey }).from(exports))
    if (e.k) referenced.add(e.k);
  for (const u of await deps.db
    .select({ k: uploads.objectKey })
    .from(uploads)
    .where(eq(uploads.state, 'pending'))) {
    referenced.add(u.k);
  }
  // Sources of in-flight processing jobs.
  for (const v of await deps.db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.state, 'processing'))) {
    referenced.add(`tmp/fetch/${v.id}`);
  }
  let scanned = 0;
  const orphans: string[] = [];
  for (const prefix of KEY_PREFIXES) {
    for await (const obj of storage.listKeys(prefix)) {
      scanned += 1;
      const age = obj.lastModified ? now - obj.lastModified.getTime() : Number.POSITIVE_INFINITY;
      if (age < ORPHAN_GRACE_MS) continue;
      // Avatar uploads awaiting confirmation live a few minutes; anything older under tmp/ is stale.
      if (!referenced.has(obj.key) && (!obj.key.startsWith('tmp/') || age > DAY))
        orphans.push(obj.key);
    }
  }
  if (orphans.length) await storage.deleteObjects(orphans);
  deps.log.info({ scanned, deleted: orphans.length }, 'storage sweep');
  return { scanned, deleted: orphans };
}

/**
 * Hourly housekeeping: expired sessions and reset links, send-idempotency records, stale uploads,
 * and data exports past their 7 days (FR-ACCT-05).
 */
export async function runCleanup(deps: Deps) {
  const now = deps.clock.now();
  const sessionsDeleted = await deleteExpiredSessions(deps.db, now);
  await purgeResets(deps.db, now);
  await deps.db
    .delete(sendRequests)
    .where(lt(sendRequests.createdAt, new Date(now.getTime() - DAY)));
  const stale = await deps.db
    .update(uploads)
    .set({ state: 'aborted' })
    .where(and(eq(uploads.state, 'pending'), lt(uploads.expiresAt, now)))
    .returning({ key: uploads.objectKey, multipartId: uploads.multipartId });
  if (deps.storage && stale.length) {
    for (const s of stale)
      if (s.multipartId) await deps.storage.abortMultipart(s.key, s.multipartId).catch(() => {});
    await deps.storage.deleteObjects(stale.map((s) => s.key)).catch(() => {});
  }
  const exportsExpired = await expireExports(deps, now);
  return { sessions: sessionsDeleted, uploads: stale.length, exports: exportsExpired };
}

/**
 * WF-ACCT-3 / NFR-DATA-01: after an account is deleted, remove its avatar and pending uploads, and
 * delete videos it added that nobody else added and no share references any more.
 */
export async function runAccountPurge(
  deps: Deps,
  job: Job<{ video_ids: string[]; keys: string[] }>,
) {
  const keys = [...job.data.keys];
  if (job.data.video_ids.length) {
    const orphaned = await deps.db
      .delete(videos)
      .where(
        and(
          inArray(videos.id, job.data.video_ids),
          sql`not exists (select 1 from shares s where s.video_id = ${videos.id})`,
          sql`not exists (select 1 from video_additions va where va.video_id = ${videos.id})`,
        ),
      )
      .returning({ media: videos.mediaKey, thumb: videos.thumbKey, id: videos.id });
    for (const v of orphaned) {
      if (v.media) keys.push(v.media);
      if (v.thumb) keys.push(v.thumb);
      keys.push(`tmp/fetch/${v.id}`);
    }
  }
  if (deps.storage && keys.length) await deps.storage.deleteObjects(keys);
  deps.log.info({ objects: keys.length }, 'account media purged');
}
