// Self-service data export (FR-ACCT-05, WF-ACCT-4): requested through the API, built by the
// `account.export` job into a ZIP in the work directory, uploaded to the private bucket and offered
// through a short-lived signed link for 7 days.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { DataExport } from '@vidfriends/contracts';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Job } from 'pg-boss';
import {
  auditLog,
  exports,
  relationships,
  replies,
  shares,
  users,
  videoAdditions,
  videos,
} from '../../db/schema.js';
import { DAY, HOUR } from '../../infra/clock.js';
import { newId } from '../../infra/ids.js';
import { keys } from '../../infra/keys.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, notFound } from '../../http/errors.js';
import type { Viewer } from '../../http/context.js';
import { audit } from '../audit/service.js';
import { requireStorage } from '../accounts/service.js';

export const JOB_EXPORT = 'account.export';
export const EXPORT_TTL_MS = 7 * DAY;
export const EXPORTS_PER_DAY = 3;
/** Builds still unfinished after this are marked failed by `session.cleanup`. */
const STUCK_AFTER_MS = 2 * HOUR;
/** Media is included while the archive stays under this size (WF-ACCT-4). */
/** Lifetime of a signed download link. */
export const LINK_TTL_S = 15 * 60;
export const MEDIA_LIMIT_BYTES = 4 * 1024 ** 3;

type ExportRow = typeof exports.$inferSelect;

export function toDataExport(row: ExportRow): DataExport {
  return {
    id: row.id,
    include_media: row.includeMedia,
    state: row.state,
    bytes: row.bytes,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    ready_at: row.readyAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
  };
}

export async function requestExport(
  deps: Deps,
  viewer: Viewer,
  includeMedia: boolean,
  ip: string,
): Promise<DataExport> {
  requireStorage(deps);
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    // Serialise this member's requests so the one-active and per-day rules hold under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`export:${viewer.id}`}))`);
    const active = await tx
      .select({ id: exports.id })
      .from(exports)
      .where(and(eq(exports.userId, viewer.id), inArray(exports.state, ['queued', 'building'])))
      .limit(1);
    if (active.length)
      throw new ApiError('export_in_progress', 'An export is already being prepared');
    const recent = await tx
      .select({ id: exports.id })
      .from(exports)
      .where(
        and(eq(exports.userId, viewer.id), gte(exports.createdAt, new Date(now.getTime() - DAY))),
      );
    if (recent.length >= EXPORTS_PER_DAY)
      throw new ApiError('rate_limited', 'Too many exports today');
    const [row] = await tx
      .insert(exports)
      .values({ id: newId(), userId: viewer.id, includeMedia, createdAt: now })
      .returning();
    await audit(tx, {
      actorId: viewer.id,
      action: 'account.export_requested',
      targetType: 'export',
      targetId: row!.id,
      metadata: { include_media: includeMedia },
      ip,
    });
    await deps.queue!.send(JOB_EXPORT, { export_id: row!.id }, { tx });
    return toDataExport(row!);
  });
}

export async function listExports(deps: Deps, viewer: Viewer): Promise<DataExport[]> {
  const rows = await deps.db
    .select()
    .from(exports)
    .where(eq(exports.userId, viewer.id))
    .orderBy(desc(exports.createdAt))
    .limit(20);
  return rows.map(toDataExport);
}

/** A signed link for a ready export of the viewer's; anything else is 404. */
export async function downloadUrl(deps: Deps, viewer: Viewer, id: string): Promise<string> {
  const storage = requireStorage(deps);
  const [row] = await deps.db
    .select()
    .from(exports)
    .where(and(eq(exports.id, id), eq(exports.userId, viewer.id)))
    .limit(1);
  const now = deps.clock.now();
  if (!row || row.state !== 'ready' || !row.objectKey || !row.expiresAt || row.expiresAt <= now)
    throw notFound();
  const day = (row.readyAt ?? now).toISOString().slice(0, 10);
  return storage.presignGet(row.objectKey, LINK_TTL_S, `vidfriends-export-${day}.zip`);
}

const userRef = (u: { username: string; displayName: string } | null | undefined) =>
  u ? { username: u.username, display_name: u.displayName } : null;
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/** Collects everything WF-ACCT-4 lists, limited to what the member can see in the app. */
async function collect(deps: Deps, userId: string) {
  const db = deps.db;
  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) throw notFound();

  const rels = await db
    .select()
    .from(relationships)
    .where(or(eq(relationships.userLow, userId), eq(relationships.userHigh, userId)));
  const otherIds = rels.map((r) => (r.userLow === userId ? r.userHigh : r.userLow));

  const sentRows = await db.select().from(shares).where(eq(shares.senderId, userId));
  // Received shares the member can see: delivered, from an active sender (BR-SHR-5).
  const receivedRows = await db
    .select({ share: shares, senderStatus: users.status })
    .from(shares)
    .innerJoin(users, eq(users.id, shares.senderId))
    .where(and(eq(shares.recipientId, userId), isNotNull(shares.deliveredAt)));
  const received = receivedRows.filter((r) => r.senderStatus === 'active').map((r) => r.share);

  const shareIds = [...sentRows, ...received].map((s) => s.id);
  const videoIds = [...new Set([...sentRows, ...received].map((s) => s.videoId))];
  const added = await db
    .select({ video: videos, addedAt: videoAdditions.createdAt })
    .from(videoAdditions)
    .innerJoin(videos, eq(videos.id, videoAdditions.videoId))
    .where(eq(videoAdditions.userId, userId))
    .orderBy(asc(videoAdditions.createdAt));
  const allVideoIds = [...new Set([...videoIds, ...added.map((a) => a.video.id)])];
  const videoRows = allVideoIds.length
    ? await db.select().from(videos).where(inArray(videos.id, allVideoIds))
    : [];
  const replyRows = shareIds.length
    ? await db
        .select()
        .from(replies)
        .where(inArray(replies.shareId, shareIds))
        .orderBy(asc(replies.createdAt))
    : [];
  const peopleIds = [
    ...new Set([
      ...otherIds,
      ...sentRows.map((s) => s.recipientId),
      ...received.map((s) => s.senderId),
      ...replyRows.map((r) => r.authorId),
    ]),
  ];
  const people = peopleIds.length
    ? await db
        .select({ id: users.id, username: users.username, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, peopleIds))
    : [];
  const person = new Map(people.map((p) => [p.id, p]));
  person.set(me.id, { id: me.id, username: me.username, displayName: me.displayName });
  const video = new Map(videoRows.map((v) => [v.id, v]));
  const videoRef = (id: string) => {
    const v = video.get(id);
    return v
      ? { title: v.title, original_link: v.sourceUrl, platform: v.platform, kind: v.sourceKind }
      : null;
  };
  const conversation = (shareId: string) =>
    replyRows
      .filter((r) => r.shareId === shareId)
      .map((r) => ({
        from: userRef(person.get(r.authorId)),
        text: r.deletedAt ? null : r.body,
        deleted: Boolean(r.deletedAt),
        at: r.createdAt.toISOString(),
      }));

  const friends = rels.flatMap((r) => {
    const other = userRef(person.get(r.userLow === userId ? r.userHigh : r.userLow));
    if (r.state === 'accepted') return [{ kind: 'friend', user: other, since: iso(r.updatedAt) }];
    if (r.state === 'pending')
      return [
        {
          kind: r.requestedBy === userId ? 'request_sent' : 'request_received',
          user: other,
          since: iso(r.updatedAt),
        },
      ];
    // Only blocks the member made; being blocked by someone is not shown in the app either.
    if (r.state === 'blocked' && r.blockedBy === userId)
      return [{ kind: 'blocked', user: other, since: iso(r.updatedAt) }];
    return [];
  });

  const security = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.actorId, userId))
    .orderBy(asc(auditLog.createdAt));

  return {
    me,
    files: {
      'profile.json': {
        username: me.username,
        display_name: me.displayName,
        role: me.role,
        created_at: me.createdAt.toISOString(),
        storage_bytes: me.storageBytes,
      },
      'friends.json': friends,
      'sent.json': sentRows.map((s) => ({
        to: userRef(person.get(s.recipientId)),
        video: videoRef(s.videoId),
        note: s.note,
        sent_at: s.createdAt.toISOString(),
        delivered_at: iso(s.deliveredAt),
        watched_at: iso(s.watchedAt),
        their_reaction: s.reaction,
        conversation: conversation(s.id),
      })),
      'received.json': received.map((s) => ({
        from: userRef(person.get(s.senderId)),
        video: videoRef(s.videoId),
        note: s.note,
        delivered_at: iso(s.deliveredAt),
        watched_at: iso(s.watchedAt),
        saved: s.saved,
        hidden: s.hidden,
        my_reaction: s.reaction,
        conversation: conversation(s.id),
      })),
      'videos.json': added.map(({ video: v, addedAt }) => ({
        id: v.id,
        title: v.title,
        original_link: v.sourceUrl,
        platform: v.platform,
        kind: v.sourceKind,
        state: v.state,
        added_at: addedAt.toISOString(),
        file_in_export: false as boolean,
      })),
      'security.json': security.map((e) => ({
        action: e.action,
        at: e.createdAt.toISOString(),
        network_address: e.ip,
      })),
    },
    media: added.map(({ video: v }) => v),
  };
}

const README = (generatedAt: string, mediaNote: string) => `VidFriends data export
Generated: ${generatedAt}

profile.json    Your account: username, display name, role, when you joined.
friends.json    Your friends, friend requests and the people you blocked.
received.json   Videos friends sent you, with notes, your reaction and the conversation.
sent.json       Videos you sent, with who watched them, their reaction and the conversation.
videos.json     Videos you added (links and uploads).
security.json   Your sign-ins and account actions recorded in the server's audit log.
avatar.webp     Your profile picture, if you have one.
media/          ${mediaNote}

Other members appear only by username and display name, and their replies only inside your own
conversations: the export holds what you could already see in the app.
`;

export async function buildExport(deps: Deps, job: Job<{ export_id: string }>): Promise<void> {
  const id = job.data.export_id;
  const [row] = await deps.db
    .update(exports)
    .set({ state: 'building' })
    .where(and(eq(exports.id, id), eq(exports.state, 'queued')))
    .returning();
  if (!row) return; // already handled, or the account is gone
  const storage = deps.storage;
  await mkdir(deps.env.WORK_DIR, { recursive: true });
  const dir = await mkdtemp(join(deps.env.WORK_DIR, `export-${id}-`));
  const file = join(dir, 'export.zip');
  try {
    if (!storage) throw new Error('object storage is not configured');
    const data = await collect(deps, row.userId);
    const out = createWriteStream(file);
    let zipError: Error | null = null;
    const zip = new Zip((err, chunk, final) => {
      if (err) zipError = err;
      else {
        out.write(chunk);
        if (final) out.end();
      }
    });
    const prefix = 'vidfriends-export/';
    const addBytes = (name: string, bytes: Uint8Array) => {
      const entry = new ZipDeflate(prefix + name, { level: 6 });
      zip.add(entry);
      entry.push(bytes, true);
    };
    const addStream = async (name: string, body: Readable) => {
      const entry = new ZipPassThrough(prefix + name);
      zip.add(entry);
      for await (const chunk of body) entry.push(chunk as Uint8Array);
      entry.push(new Uint8Array(0), true);
    };
    let mediaNote = 'Not included: you exported without media.';
    if (row.includeMedia) {
      let total = 0;
      const skipped: string[] = [];
      for (const v of data.media) {
        if (!v.mediaKey) continue;
        if (total + v.mediaBytes > MEDIA_LIMIT_BYTES) {
          skipped.push(v.id);
          continue;
        }
        await addStream(`media/${v.id}.mp4`, await storage.getObject(v.mediaKey));
        total += v.mediaBytes;
        const entry = data.files['videos.json'].find((e) => e.id === v.id);
        if (entry) entry.file_in_export = true;
      }
      mediaNote = skipped.length
        ? `Video files you added, named by video id. Left out to stay under 4 GiB: ${skipped.join(', ')}.`
        : 'Video files you added that are still stored, named by video id (see videos.json).';
    }
    const generatedAt = deps.clock.now().toISOString();
    const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, 2) + '\n');
    addBytes('README.txt', new TextEncoder().encode(README(generatedAt, mediaNote)));
    for (const [name, value] of Object.entries(data.files)) addBytes(name, encode(value));
    if (data.me.avatarKey)
      await addStream('avatar.webp', await storage.getObject(data.me.avatarKey));
    zip.end();
    await finished(out);
    if (zipError) throw zipError;

    const bytes = (await stat(file)).size;
    const key = keys.export(row.userId, row.id);
    await storage.putObject(key, createReadStream(file), 'application/zip', bytes);
    const now = deps.clock.now();
    const [done] = await deps.db
      .update(exports)
      .set({
        state: 'ready',
        objectKey: key,
        bytes,
        readyAt: now,
        expiresAt: new Date(now.getTime() + EXPORT_TTL_MS),
      })
      .where(and(eq(exports.id, id), eq(exports.state, 'building')))
      .returning({ id: exports.id });
    // The account was deleted meanwhile: do not leave the file behind.
    if (!done) await storage.deleteObjects([key]).catch(() => {});
    deps.log.info({ export_id: id, bytes }, 'export ready');
  } catch (err) {
    deps.log.error({ err, export_id: id }, 'export failed');
    await deps.db
      .update(exports)
      .set({ state: 'failed', error: 'The export could not be built. Please try again.' })
      .where(eq(exports.id, id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Fails stuck builds, expires ready exports past their 7 days and deletes their files (run by
 * `session.cleanup`).
 */
export async function expireExports(deps: Deps, now: Date): Promise<number> {
  // A build the worker never finished (crash, job expiry) must not block new requests forever.
  await deps.db
    .update(exports)
    .set({ state: 'failed', error: 'The export could not be built. Please try again.' })
    .where(
      and(
        inArray(exports.state, ['queued', 'building']),
        lt(exports.createdAt, new Date(now.getTime() - STUCK_AFTER_MS)),
      ),
    );
  const due = await deps.db
    .select({ id: exports.id, key: exports.objectKey })
    .from(exports)
    .where(and(eq(exports.state, 'ready'), lt(exports.expiresAt, now)));
  if (!due.length) return 0;
  const objectKeys = due.map((d) => d.key).filter((k): k is string => Boolean(k));
  if (objectKeys.length && deps.storage) await deps.storage.deleteObjects(objectKeys);
  await deps.db
    .update(exports)
    .set({ state: 'expired', objectKey: null })
    .where(
      inArray(
        exports.id,
        due.map((d) => d.id),
      ),
    );
  return due.length;
}
