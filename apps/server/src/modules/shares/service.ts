// Shares, feed and engagement (FRD §6–8): WF-SHR-1/2, BR-SHR-1..6, BR-FEED-1..7, BR-ENG-1..5.
// Every read that returns shares carries the participant predicate in SQL (SDD §3 layer 3).
import {
  REACTIONS,
  type FeedItem,
  type ReceivedShare,
  type Reply,
  type SentShare,
  type ShareDetail,
} from '@vidfriends/contracts';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { collectionItems, replies, sendRequests, shares, users, videos } from '../../db/schema.js';
import { DAY, HOUR, MINUTE } from '../../infra/clock.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, notFound } from '../../http/errors.js';
import { decodeCursor, encodeCursor, type CursorValue } from '../../http/pagination.js';
import { toPublicUser } from '../accounts/serialize.js';
import { canSendTo } from '../friends/policy.js';
import { markShareRead, notify } from '../notifications/service.js';
import { toVideo, type VideoRow } from '../videos/serialize.js';
import { mediaUrls } from '../videos/service.js';

type ShareRow = typeof shares.$inferSelect;
type UserRow = typeof users.$inferSelect;

/** BR-SHR-3: watched at ≥ 50% of the duration or ≥ 10 s, whichever comes first. */
export const WATCHED_SECONDS = 10;
export const INBOX_WATCHED_WINDOW_MS = 48 * HOUR;
export const REPLY_LIMIT = { count: 60, windowMs: 10 * MINUTE };
const PLAYABLE = ['ready', 'link_only', 'expired'] as const;

const sender = alias(users, 'sender');
const recipient = alias(users, 'recipient');

const replyCount = sql<number>`(select count(*)::int from replies r where r.share_id = ${shares.id} and r.deleted_at is null)`;

/** Shares joined with their video and both users; `where` must include the participant predicate. */
export function shareQuery(db: DbOrTx) {
  return db
    .select({ share: shares, video: videos, sender, recipient, replyCount })
    .from(shares)
    .innerJoin(videos, eq(videos.id, shares.videoId))
    .innerJoin(sender, eq(sender.id, shares.senderId))
    .innerJoin(recipient, eq(recipient.id, shares.recipientId));
}

/** Shares in a collection with the time each was added (BR-COL-3). */
export function collectionShareQuery(db: DbOrTx) {
  return db
    .select({
      share: shares,
      video: videos,
      sender,
      recipient,
      replyCount,
      addedAt: collectionItems.addedAt,
    })
    .from(collectionItems)
    .innerJoin(shares, eq(shares.id, collectionItems.shareId))
    .innerJoin(videos, eq(videos.id, shares.videoId))
    .innerJoin(sender, eq(sender.id, shares.senderId))
    .innerJoin(recipient, eq(recipient.id, shares.recipientId));
}

export interface Joined {
  share: ShareRow;
  video: VideoRow;
  sender: UserRow;
  recipient: UserRow;
  replyCount: number;
}

export function toReceived(r: Joined): ReceivedShare {
  return {
    id: r.share.id,
    video: toVideo(r.video),
    sender: toPublicUser(r.sender),
    note: r.share.note,
    delivered_at: (r.share.deliveredAt ?? r.share.createdAt).toISOString(),
    watched_at: r.share.watchedAt?.toISOString() ?? null,
    progress_ms: r.share.progressMs,
    saved: r.share.saved,
    hidden: r.share.hidden,
    reaction: (r.share.reaction as ReceivedShare['reaction']) ?? null,
    reply_count: r.replyCount,
    created_at: r.share.createdAt.toISOString(),
  };
}

function toDetail(r: Joined, viewerId: string): ShareDetail {
  const isRecipient = r.share.recipientId === viewerId;
  return {
    id: r.share.id,
    role: isRecipient ? 'recipient' : 'sender',
    video: toVideo(r.video),
    sender: toPublicUser(r.sender),
    recipient: toPublicUser(r.recipient),
    note: r.share.note,
    delivered_at: r.share.deliveredAt?.toISOString() ?? null,
    watched_at: r.share.watchedAt?.toISOString() ?? null,
    progress_ms: isRecipient ? r.share.progressMs : null,
    saved: isRecipient ? r.share.saved : null,
    hidden: isRecipient ? r.share.hidden : null,
    reaction: (r.share.reaction as ShareDetail['reaction']) ?? null,
    reply_count: r.replyCount,
    created_at: r.share.createdAt.toISOString(),
  };
}

/**
 * BR-SHR-6 + BR-SHR-5: a share is visible only to its participants, only once delivered for the
 * recipient, and not while the other party is suspended. Anything else is 404 (BR-GEN-3).
 */
async function participantShare(
  deps: Deps,
  viewer: Viewer,
  id: string,
  role?: 'sender' | 'recipient',
): Promise<Joined> {
  const [row] = await shareQuery(deps.db)
    .where(
      and(
        eq(shares.id, id),
        role === 'sender'
          ? eq(shares.senderId, viewer.id)
          : role === 'recipient'
            ? eq(shares.recipientId, viewer.id)
            : sql`(${shares.senderId} = ${viewer.id}::uuid or ${shares.recipientId} = ${viewer.id}::uuid)`,
        sql`(${shares.senderId} = ${viewer.id}::uuid or ${shares.deliveredAt} is not null)`,
        sql`(case when ${shares.senderId} = ${viewer.id}::uuid then ${recipient.status} else ${sender.status} end) = 'active'`,
      ),
    )
    .limit(1);
  if (!row) throw notFound();
  return row as Joined;
}

// ---------------------------------------------------------------------------------------------
// Sending (WF-SHR-1/2)

export interface SendResult {
  results: {
    recipient_id: string;
    status: 'sent' | 'already_sent' | 'not_allowed';
    share_id: string | null;
  }[];
}

/** WF-SHR-1: one share per allowed recipient, atomically and idempotently. */
export async function send(
  deps: Deps,
  viewer: Viewer,
  input: { videoId: string; recipientIds: string[]; note: string; idempotencyKey: string },
): Promise<SendResult> {
  const run = () =>
    deps.db.transaction(async (tx) => {
      const now = deps.clock.now();
      const [previous] = await tx
        .select()
        .from(sendRequests)
        .where(
          and(
            eq(sendRequests.senderId, viewer.id),
            eq(sendRequests.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (previous && previous.createdAt.getTime() > now.getTime() - DAY)
        return previous.response as SendResult;

      // The sender added the video or received a share of it (re-sharing is allowed).
      const [video] = await tx
        .select()
        .from(videos)
        .where(
          and(
            eq(videos.id, input.videoId),
            sql`${videos.state} <> 'failed'`,
            sql`(exists (select 1 from video_additions va where va.video_id = ${videos.id} and va.user_id = ${viewer.id}::uuid)
              or exists (select 1 from shares s where s.video_id = ${videos.id} and s.recipient_id = ${viewer.id}::uuid and s.delivered_at is not null))`,
          ),
        );
      if (!video) throw new ApiError('video_not_found', 'Video not found');
      const playable = (PLAYABLE as readonly string[]).includes(video.state);

      const results: SendResult['results'] = [];
      for (const recipientId of [...new Set(input.recipientIds)]) {
        if (!(await canSendTo(tx, viewer.id, recipientId))) {
          results.push({ recipient_id: recipientId, status: 'not_allowed', share_id: null });
          continue;
        }
        const [inserted] = await tx
          .insert(shares)
          .values({
            id: newId(),
            videoId: video.id,
            senderId: viewer.id,
            recipientId,
            note: input.note,
            // Shares of a not-yet-playable video are delivered when it becomes playable (FR-SHR-03).
            deliveredAt: playable ? now : null,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted) {
          const [existing] = await tx
            .select({ id: shares.id })
            .from(shares)
            .where(
              and(
                eq(shares.senderId, viewer.id),
                eq(shares.recipientId, recipientId),
                eq(shares.videoId, video.id),
              ),
            );
          results.push({
            recipient_id: recipientId,
            status: 'already_sent',
            share_id: existing?.id ?? null,
          });
          continue;
        }
        if (playable) {
          await notify(deps, tx, {
            userId: recipientId,
            type: 'share_received',
            actorId: viewer.id,
            shareId: inserted.id,
          });
        }
        results.push({ recipient_id: recipientId, status: 'sent', share_id: inserted.id });
      }
      const response: SendResult = { results };
      await tx
        .insert(sendRequests)
        .values({
          senderId: viewer.id,
          idempotencyKey: input.idempotencyKey,
          response,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [sendRequests.senderId, sendRequests.idempotencyKey],
          set: { response, createdAt: now },
        });
      return response;
    });
  try {
    return await run();
  } catch (err) {
    // A concurrent retry with the same key: the other transaction's result wins.
    const code =
      (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') return run();
    throw err;
  }
}

/** LLD §4 finalize shares: deliver pending shares and notify, inside the video's transaction. */
export async function deliverPendingShares(deps: Deps, tx: DbOrTx, videoId: string): Promise<void> {
  const now = deps.clock.now();
  const delivered = await tx
    .update(shares)
    .set({ deliveredAt: now })
    .where(and(eq(shares.videoId, videoId), isNull(shares.deliveredAt)))
    .returning({ id: shares.id, senderId: shares.senderId, recipientId: shares.recipientId });
  for (const s of delivered) {
    await notify(deps, tx, {
      userId: s.recipientId,
      type: 'share_received',
      actorId: s.senderId,
      shareId: s.id,
    });
  }
}

/** WF-SHR-2: the sender may unsend while unwatched; the notification goes with it (FK cascade). */
export async function unsend(deps: Deps, viewer: Viewer, id: string): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const [share] = await tx
      .select()
      .from(shares)
      .where(and(eq(shares.id, id), eq(shares.senderId, viewer.id)))
      .for('update');
    if (!share) throw notFound();
    if (share.watchedAt) throw new ApiError('already_watched', 'Your friend already watched this');
    await tx.delete(shares).where(eq(shares.id, id));
  });
}

/** BR-FRND-5: a block deletes every share between the pair, for both sides. */
export async function deleteSharesBetween(tx: DbOrTx, a: string, b: string): Promise<void> {
  await tx
    .delete(shares)
    .where(
      sql`(${shares.senderId} = ${a}::uuid and ${shares.recipientId} = ${b}::uuid) or (${shares.senderId} = ${b}::uuid and ${shares.recipientId} = ${a}::uuid)`,
    );
}

// ---------------------------------------------------------------------------------------------
// Viewing

export async function getDetail(deps: Deps, viewer: Viewer, id: string): Promise<ShareDetail> {
  const row = await participantShare(deps, viewer, id);
  await markShareRead(deps.db, viewer.id, id, deps.clock.now());
  return toDetail(row, viewer.id);
}

export async function shareMedia(deps: Deps, viewer: Viewer, id: string) {
  const row = await participantShare(deps, viewer, id);
  return mediaUrls(deps, row.video);
}

/** BR-SHR-3 / BR-FEED-7: set watched once; watching marks every share of the video watched. */
export async function progress(
  deps: Deps,
  viewer: Viewer,
  id: string,
  input: {
    position_ms: number;
    duration_ms?: number | undefined;
    opened_original?: boolean | undefined;
  },
) {
  const row = await participantShare(deps, viewer, id, 'recipient');
  return deps.db.transaction(async (tx) => {
    const now = deps.clock.now();
    const progressMs = Math.max(row.share.progressMs, input.position_ms);
    const duration = row.video.durationMs ?? input.duration_ms ?? null;
    const reached =
      input.opened_original === true ||
      input.position_ms >= WATCHED_SECONDS * 1000 ||
      (duration !== null && duration > 0 && input.position_ms >= duration * 0.5);
    await tx.update(shares).set({ progressMs }).where(eq(shares.id, id));
    let watchedAt = row.share.watchedAt;
    if (!watchedAt && reached) {
      watchedAt = now;
      const marked = await tx
        .update(shares)
        .set({ watchedAt: now })
        .where(
          and(
            eq(shares.recipientId, viewer.id),
            eq(shares.videoId, row.video.id),
            isNull(shares.watchedAt),
            sql`${shares.deliveredAt} is not null`,
          ),
        )
        .returning({ id: shares.id, senderId: shares.senderId });
      for (const m of marked) {
        await markShareRead(tx, viewer.id, m.id, now);
        await notify(deps, tx, {
          userId: m.senderId,
          type: 'share_watched',
          actorId: viewer.id,
          shareId: m.id,
        });
      }
    }
    return { watched_at: watchedAt?.toISOString() ?? null, progress_ms: progressMs };
  });
}

export async function updateRecipientState(
  deps: Deps,
  viewer: Viewer,
  id: string,
  patch: { saved?: boolean | undefined; hidden?: boolean | undefined },
) {
  await participantShare(deps, viewer, id, 'recipient');
  const now = deps.clock.now();
  const set: Partial<ShareRow> = {};
  if (patch.saved !== undefined) {
    set.saved = patch.saved;
    set.savedAt = patch.saved ? now : null;
  }
  if (patch.hidden !== undefined) set.hidden = patch.hidden;
  if (Object.keys(set).length)
    await deps.db.transaction(async (tx) => {
      await tx.update(shares).set(set).where(eq(shares.id, id));
      // BR-COL-2: a share in a collection is saved; unsaving takes it out of every collection.
      if (patch.saved === false)
        await tx.delete(collectionItems).where(eq(collectionItems.shareId, id));
    });
  return toDetail(await participantShare(deps, viewer, id, 'recipient'), viewer.id);
}

// ---------------------------------------------------------------------------------------------
// Engagement (FRD §8)

export async function setReaction(deps: Deps, viewer: Viewer, id: string, emoji: string | null) {
  const row = await participantShare(deps, viewer, id, 'recipient');
  if (emoji !== null && !(REACTIONS as readonly string[]).includes(emoji)) {
    throw new ApiError('invalid_reaction', 'Pick one of the available reactions');
  }
  await deps.db.transaction(async (tx) => {
    await tx
      .update(shares)
      .set({ reaction: emoji, reactionAt: emoji ? deps.clock.now() : null })
      .where(eq(shares.id, id));
    // BR-ENG-2: notify when first set or changed, not when cleared.
    if (emoji && emoji !== row.share.reaction) {
      await notify(deps, tx, {
        userId: row.share.senderId,
        type: 'reaction_received',
        actorId: viewer.id,
        shareId: id,
        data: { emoji },
      });
    }
  });
  return toDetail(await participantShare(deps, viewer, id, 'recipient'), viewer.id);
}

function toReply(r: typeof replies.$inferSelect, author: UserRow): Reply {
  return {
    id: r.id,
    share_id: r.shareId,
    author: toPublicUser(author),
    body: r.deletedAt ? null : r.body,
    deleted: Boolean(r.deletedAt),
    created_at: r.createdAt.toISOString(),
  };
}

export async function listReplies(
  deps: Deps,
  viewer: Viewer,
  id: string,
  cursor: string | undefined,
  limit: number,
) {
  await participantShare(deps, viewer, id);
  const author = alias(users, 'author');
  const c = decodeCursor(cursor, 1);
  const rows = await deps.db
    .select({ reply: replies, author })
    .from(replies)
    .innerJoin(author, eq(author.id, replies.authorId))
    .where(and(eq(replies.shareId, id), c ? gt(replies.id, c[0] as string) : undefined))
    .orderBy(asc(replies.id))
    .limit(limit + 1);
  return {
    items: rows.slice(0, limit).map((r) => toReply(r.reply, r.author)),
    next_cursor: rows.length > limit ? encodeCursor([rows[limit - 1]!.reply.id]) : null,
  };
}

export async function postReply(deps: Deps, viewer: Viewer, id: string, body: string) {
  const row = await participantShare(deps, viewer, id);
  const limit = deps.rateLimiter.hit(`reply:${viewer.id}`, REPLY_LIMIT.count, REPLY_LIMIT.windowMs);
  if (!limit.allowed) throw new ApiError('rate_limited', 'You are replying too fast');
  return deps.db.transaction(async (tx) => {
    const [reply] = await tx
      .insert(replies)
      .values({ id: newId(), shareId: id, authorId: viewer.id, body, createdAt: deps.clock.now() })
      .returning();
    const other = row.share.senderId === viewer.id ? row.share.recipientId : row.share.senderId;
    await notify(deps, tx, {
      userId: other,
      type: 'reply_received',
      actorId: viewer.id,
      shareId: id,
    });
    const [author] = await tx.select().from(users).where(eq(users.id, viewer.id));
    return { reply: toReply(reply!, author!) };
  });
}

/** BR-ENG-3: the author deletes a reply; its text is erased and a placeholder remains. */
export async function deleteReply(deps: Deps, viewer: Viewer, replyId: string) {
  const [reply] = await deps.db
    .select({ reply: replies, share: shares })
    .from(replies)
    .innerJoin(shares, eq(shares.id, replies.shareId))
    .where(and(eq(replies.id, replyId), eq(replies.authorId, viewer.id)));
  if (!reply || reply.reply.deletedAt) throw notFound();
  await deps.db
    .update(replies)
    .set({ deletedAt: deps.clock.now(), body: '-' })
    .where(eq(replies.id, replyId));
}

// ---------------------------------------------------------------------------------------------
// Lists (BR-FEED-1..6)

/** Received shares the viewer may see in their lists (BR-SHR-5: sender active). */
export function receivedVisible(viewerId: string) {
  return and(
    eq(shares.recipientId, viewerId),
    sql`${shares.deliveredAt} is not null`,
    eq(sender.status, 'active'),
    inArray(videos.state, [...PLAYABLE]),
  );
}

async function loadReceived(deps: Deps, ids: string[]): Promise<Map<string, Joined>> {
  if (!ids.length) return new Map();
  const rows = (await shareQuery(deps.db).where(inArray(shares.id, ids))) as Joined[];
  return new Map(rows.map((r) => [r.share.id, r]));
}

export function tsCursor(values: CursorValue[] | null): { ts: Date; id: string } | null {
  return values ? { ts: new Date(values[0] as string), id: values[1] as string } : null;
}

/** BR-FEED-1 + BR-FEED-7: unwatched oldest first, then watched newest first; one item per video. */
export async function feed(deps: Deps, viewer: Viewer, cursor: string | undefined, limit: number) {
  const c = decodeCursor(cursor, 3);
  const section = c ? Number(c[0]) : 0;
  const ts = c ? new Date(c[1] as string) : null;
  const lastId = c ? (c[2] as string) : null;
  const cursorSql = !c
    ? sql`true`
    : section === 0
      ? sql`(p.section > 0 or (p.delivered_at, p.id) > (${ts}::timestamptz, ${lastId}::uuid))`
      : sql`(p.section = 1 and (p.watched_at, p.id) < (${ts}::timestamptz, ${lastId}::uuid))`;
  const page = await deps.db.execute<{
    id: string;
    section: number;
    delivered_at: Date;
    watched_at: Date | null;
    video_id: string;
  }>(sql`
    with visible as (
      select s.id, s.video_id, s.delivered_at, s.watched_at
      from shares s
      join videos v on v.id = s.video_id
      join users su on su.id = s.sender_id
      where s.recipient_id = ${viewer.id}::uuid and s.hidden = false and s.delivered_at is not null
        and su.status = 'active' and v.state in ('ready', 'link_only', 'expired')
    ), p as (
      select distinct on (video_id) id, video_id, delivered_at, watched_at,
        case when watched_at is null then 0 else 1 end as section
      from visible
      order by video_id, (watched_at is not null), delivered_at, id
    )
    select * from p where ${cursorSql}
    order by section,
      case when section = 0 then delivered_at end asc,
      case when section = 1 then watched_at end desc,
      case when section = 0 then id end asc,
      case when section = 1 then id end desc
    limit ${limit + 1}
  `);
  const rows = page.rows.slice(0, limit);
  const details = await loadReceived(
    deps,
    rows.map((r) => r.id),
  );
  // "Also sent by": other visible senders of the same videos.
  const videoIds = rows.map((r) => r.video_id);
  const others = videoIds.length
    ? await deps.db
        .select({ videoId: shares.videoId, shareId: shares.id, user: sender })
        .from(shares)
        .innerJoin(sender, eq(sender.id, shares.senderId))
        .where(
          and(
            eq(shares.recipientId, viewer.id),
            inArray(shares.videoId, videoIds),
            eq(shares.hidden, false),
            sql`${shares.deliveredAt} is not null`,
            eq(sender.status, 'active'),
          ),
        )
        .orderBy(asc(shares.deliveredAt))
    : [];
  const items: FeedItem[] = [];
  for (const r of rows) {
    const d = details.get(r.id);
    if (!d) continue;
    items.push({
      ...toReceived(d),
      section: Number(r.section) === 0 ? 'unwatched' : 'watched',
      also_sent_by: others
        .filter((o) => o.videoId === r.video_id && o.shareId !== r.id)
        .map((o) => toPublicUser(o.user)),
    });
  }
  const last = page.rows.length > limit ? rows[rows.length - 1] : undefined;
  const next = last
    ? encodeCursor([
        Number(last.section),
        new Date(
          Number(last.section) === 0 ? last.delivered_at : (last.watched_at as Date),
        ).toISOString(),
        last.id,
      ])
    : null;
  return { items, next_cursor: next };
}

/** Shared keyset list over received shares, newest first by `column`. */
async function receivedList(
  deps: Deps,
  viewer: Viewer,
  where: ReturnType<typeof sql> | undefined,
  column: typeof shares.deliveredAt | typeof shares.savedAt | typeof shares.watchedAt,
  cursor: string | undefined,
  limit: number,
) {
  const c = tsCursor(decodeCursor(cursor, 2));
  const rows = (await shareQuery(deps.db)
    .where(
      and(
        receivedVisible(viewer.id),
        where,
        sql`${column} is not null`,
        c ? sql`(${column}, ${shares.id}) < (${c.ts}::timestamptz, ${c.id}::uuid)` : undefined,
      ),
    )
    .orderBy(sql`${column} desc`, sql`${shares.id} desc`)
    .limit(limit + 1)) as Joined[];
  const items = rows.slice(0, limit).map(toReceived);
  const last = rows.length > limit ? rows[limit - 1] : undefined;
  const key =
    column === shares.savedAt
      ? 'savedAt'
      : column === shares.watchedAt
        ? 'watchedAt'
        : 'deliveredAt';
  return {
    items,
    next_cursor: last
      ? encodeCursor([(last.share[key] as Date).toISOString(), last.share.id])
      : null,
  };
}

/** BR-FEED-2: unwatched, saved, or watched in the last 48 h; newest first. */
export function inbox(deps: Deps, viewer: Viewer, cursor: string | undefined, limit: number) {
  const since = new Date(deps.clock.now().getTime() - INBOX_WATCHED_WINDOW_MS);
  return receivedList(
    deps,
    viewer,
    sql`${shares.hidden} = false and (${shares.watchedAt} is null or ${shares.saved} or ${shares.watchedAt} > ${since})`,
    shares.deliveredAt,
    cursor,
    limit,
  );
}

/** BR-FEED-3. */
export function saved(deps: Deps, viewer: Viewer, cursor: string | undefined, limit: number) {
  return receivedList(deps, viewer, sql`${shares.saved}`, shares.savedAt, cursor, limit);
}

/** BR-FEED-4: newest watched first, filterable by sender and title substring. */
export function history(
  deps: Deps,
  viewer: Viewer,
  filter: { sender?: string | undefined; q?: string | undefined },
  cursor: string | undefined,
  limit: number,
) {
  const q = filter.q?.trim();
  return receivedList(
    deps,
    viewer,
    and(
      filter.sender ? eq(shares.senderId, filter.sender) : undefined,
      q
        ? sql`${videos.title} ilike ${'%' + q.replace(/[\\%_]/g, (ch) => `\\${ch}`) + '%'}`
        : undefined,
    ) as ReturnType<typeof sql> | undefined,
    shares.watchedAt,
    cursor,
    limit,
  );
}

/** BR-FEED-5 / BR-SHR-4: per-recipient state without saved/hidden. */
export async function sent(deps: Deps, viewer: Viewer, cursor: string | undefined, limit: number) {
  const c = tsCursor(decodeCursor(cursor, 2));
  const rows = (await shareQuery(deps.db)
    .where(
      and(
        eq(shares.senderId, viewer.id),
        eq(recipient.status, 'active'),
        c
          ? sql`(${shares.createdAt}, ${shares.id}) < (${c.ts}::timestamptz, ${c.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(sql`${shares.createdAt} desc`, sql`${shares.id} desc`)
    .limit(limit + 1)) as Joined[];
  const pageRows = rows.slice(0, limit);
  const ids = pageRows.map((r) => r.share.id);
  const lastReplies = ids.length
    ? await deps.db.execute<{
        share_id: string;
        author_id: string;
        body: string;
        deleted_at: Date | null;
        created_at: Date;
      }>(sql`
        select distinct on (share_id) share_id, author_id, body, deleted_at, created_at
        from replies where share_id in (${sql.join(
          ids.map((i) => sql`${i}::uuid`),
          sql`, `,
        )})
        order by share_id, created_at desc, id desc`)
    : { rows: [] };
  const byShare = new Map(lastReplies.rows.map((r) => [r.share_id, r]));
  const items: SentShare[] = pageRows.map((r) => {
    const lr = byShare.get(r.share.id);
    return {
      id: r.share.id,
      video: toVideo(r.video),
      recipient: toPublicUser(r.recipient),
      note: r.share.note,
      status: r.share.watchedAt ? 'watched' : r.share.deliveredAt ? 'delivered' : 'processing',
      watched_at: r.share.watchedAt?.toISOString() ?? null,
      reaction: (r.share.reaction as SentShare['reaction']) ?? null,
      reply_count: r.replyCount,
      last_reply: lr
        ? {
            author_id: lr.author_id,
            body: lr.deleted_at ? null : lr.body,
            created_at: new Date(lr.created_at).toISOString(),
          }
        : null,
      created_at: r.share.createdAt.toISOString(),
    };
  });
  const last = rows.length > limit ? pageRows[pageRows.length - 1] : undefined;
  return {
    items,
    next_cursor: last ? encodeCursor([last.share.createdAt.toISOString(), last.share.id]) : null,
  };
}
