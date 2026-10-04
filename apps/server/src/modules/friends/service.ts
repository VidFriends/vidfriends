// Friends state machine (FRD §4, BR-FRND-1..8, FR-FRND-01..05).
import type { Relationship, RelationshipState } from '@vidfriends/contracts';
import { and, eq, ne, sql } from 'drizzle-orm';
import { relationships, users } from '../../db/schema.js';
import { DAY } from '../../infra/clock.js';
import type { DbOrTx } from '../../infra/db.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, notFound } from '../../http/errors.js';
import { toPublicUser } from '../accounts/serialize.js';
import { audit } from '../audit/service.js';
import { getRelationship, pair, type RelationshipRow } from './policy.js';

export const DECLINE_COOLDOWN_MS = 7 * DAY;
export const REQUESTS_PER_DAY = 30;

type UserRow = typeof users.$inferSelect;

/** The relationship as the viewer sees it; null means "hidden" (the other side blocked the viewer). */
export function viewerState(
  row: RelationshipRow | null,
  viewerId: string,
): RelationshipState | null {
  if (!row || row.state === 'none') return 'none';
  if (row.state === 'accepted') return 'friends';
  if (row.state === 'pending')
    return row.requestedBy === viewerId ? 'request_sent' : 'request_received';
  return row.blockedBy === viewerId ? 'blocked' : null;
}

function toRelationship(
  user: UserRow,
  state: RelationshipState,
  row: RelationshipRow | null,
): Relationship {
  return {
    user: toPublicUser(user),
    state,
    since: row && state !== 'none' ? row.updatedAt.toISOString() : null,
  };
}

/** A member the viewer may interact with: exists, active, not themselves. Otherwise 404. */
async function targetUser(db: DbOrTx, viewer: Viewer, userId: string): Promise<UserRow> {
  if (userId === viewer.id) throw notFound();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== 'active') throw notFound();
  return user;
}

async function writeState(
  db: DbOrTx,
  a: string,
  b: string,
  values: {
    state: RelationshipRow['state'];
    requestedBy?: string | null;
    blockedBy?: string | null;
    cooldownUntil?: Date | null;
  },
  now: Date,
) {
  const [low, high] = pair(a, b);
  const set = {
    state: values.state,
    requestedBy: values.requestedBy ?? null,
    blockedBy: values.blockedBy ?? null,
    cooldownUntil: values.cooldownUntil ?? null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(relationships)
    .values({ userLow: low, userHigh: high, createdAt: now, ...set })
    .onConflictDoUpdate({ target: [relationships.userLow, relationships.userHigh], set })
    .returning();
  return row as RelationshipRow;
}

async function deleteRow(db: DbOrTx, a: string, b: string) {
  const [low, high] = pair(a, b);
  await db
    .delete(relationships)
    .where(and(eq(relationships.userLow, low), eq(relationships.userHigh, high)));
}

/** Locks the pair so concurrent transitions serialise. */
async function lockPair(db: DbOrTx, a: string, b: string) {
  const [low, high] = pair(a, b);
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`rel:${low}:${high}`}))`);
}

export interface FriendEvents {
  requestReceived?(tx: DbOrTx, from: string, to: string): Promise<void>;
  requestAccepted?(tx: DbOrTx, accepter: string, requester: string): Promise<void>;
  blocked?(tx: DbOrTx, blocker: string, blocked: string): Promise<void>;
}

/** Hooks other modules (notifications, shares) register; avoids an import cycle. */
export const friendEvents: FriendEvents = {};

export async function sendRequest(
  deps: Deps,
  viewer: Viewer,
  userId: string,
  ip: string,
): Promise<Relationship> {
  const user = await targetUser(deps.db, viewer, userId);
  return deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    const state = viewerState(row, viewer.id);
    const now = deps.clock.now();
    if (state === null || state === 'blocked') throw notFound(); // blocked either way → 404
    if (state === 'friends') throw new ApiError('already_friends', 'You are already friends');
    if (state === 'request_sent') return toRelationship(user, 'request_sent', row);
    if (state === 'request_received') {
      // BR-FRND-3: a mutual request is accepted immediately.
      const accepted = await writeState(tx, viewer.id, userId, { state: 'accepted' }, now);
      await friendEvents.requestAccepted?.(tx, viewer.id, userId);
      await audit(tx, {
        actorId: viewer.id,
        action: 'friend.accepted',
        targetType: 'user',
        targetId: userId,
        ip,
      });
      return toRelationship(user, 'friends', accepted);
    }
    if (row?.cooldownUntil && row.requestedBy === viewer.id && row.cooldownUntil > now) {
      throw new ApiError('cooldown', 'You can send another request later', {
        retry_after: row.cooldownUntil.toISOString(),
      });
    }
    const limit = deps.rateLimiter.hit(`friend-req:${viewer.id}`, REQUESTS_PER_DAY, DAY);
    if (!limit.allowed) throw new ApiError('rate_limited', 'Too many friend requests today');
    const pending = await writeState(
      tx,
      viewer.id,
      userId,
      { state: 'pending', requestedBy: viewer.id },
      now,
    );
    await friendEvents.requestReceived?.(tx, viewer.id, userId);
    return toRelationship(user, 'request_sent', pending);
  });
}

export async function acceptRequest(
  deps: Deps,
  viewer: Viewer,
  userId: string,
  ip: string,
): Promise<Relationship> {
  const user = await targetUser(deps.db, viewer, userId);
  return deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    if (viewerState(row, viewer.id) !== 'request_received') throw notFound();
    const accepted = await writeState(
      tx,
      viewer.id,
      userId,
      { state: 'accepted' },
      deps.clock.now(),
    );
    await friendEvents.requestAccepted?.(tx, viewer.id, userId);
    await audit(tx, {
      actorId: viewer.id,
      action: 'friend.accepted',
      targetType: 'user',
      targetId: userId,
      ip,
    });
    return toRelationship(user, 'friends', accepted);
  });
}

/** BR-FRND-4: decline silently; the requester may ask again after 7 days. */
export async function declineRequest(deps: Deps, viewer: Viewer, userId: string): Promise<void> {
  await targetUser(deps.db, viewer, userId);
  await deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    if (viewerState(row, viewer.id) !== 'request_received') throw notFound();
    const now = deps.clock.now();
    await writeState(
      tx,
      viewer.id,
      userId,
      {
        state: 'none',
        requestedBy: userId,
        cooldownUntil: new Date(now.getTime() + DECLINE_COOLDOWN_MS),
      },
      now,
    );
  });
}

export async function cancelRequest(deps: Deps, viewer: Viewer, userId: string): Promise<void> {
  await deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    if (viewerState(row, viewer.id) !== 'request_sent') throw notFound();
    await deleteRow(tx, viewer.id, userId);
  });
}

export async function removeFriend(
  deps: Deps,
  viewer: Viewer,
  userId: string,
  ip: string,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    if (viewerState(row, viewer.id) !== 'friends') throw notFound();
    await deleteRow(tx, viewer.id, userId);
    await audit(tx, {
      actorId: viewer.id,
      action: 'friend.removed',
      targetType: 'user',
      targetId: userId,
      ip,
    });
  });
}

/** BR-FRND-5: a block removes any friendship or request and hides the pair from each other. */
export async function block(deps: Deps, viewer: Viewer, userId: string, ip: string): Promise<void> {
  if (userId === viewer.id) throw notFound();
  const [user] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw notFound();
  await deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    // Already blocked by the other side: nothing to change and nothing to reveal.
    if (row?.state === 'blocked') return;
    await writeState(
      tx,
      viewer.id,
      userId,
      { state: 'blocked', blockedBy: viewer.id },
      deps.clock.now(),
    );
    await friendEvents.blocked?.(tx, viewer.id, userId);
    await audit(tx, {
      actorId: viewer.id,
      action: 'user.blocked',
      targetType: 'user',
      targetId: userId,
      ip,
    });
  });
}

/** BR-FRND-6: only the blocker can unblock; the pair returns to no relationship. */
export async function unblock(
  deps: Deps,
  viewer: Viewer,
  userId: string,
  ip: string,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    await lockPair(tx, viewer.id, userId);
    const row = await getRelationship(tx, viewer.id, userId);
    if (viewerState(row, viewer.id) !== 'blocked') throw notFound();
    await deleteRow(tx, viewer.id, userId);
    await audit(tx, {
      actorId: viewer.id,
      action: 'user.unblocked',
      targetType: 'user',
      targetId: userId,
      ip,
    });
  });
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** BR-FRND-8: ≥ 2 chars, ≤ 20 results, excludes self, users who blocked the viewer, suspended users. */
export async function search(deps: Deps, viewer: Viewer, q: string): Promise<Relationship[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) throw new ApiError('query_too_short', 'Type at least 2 characters');
  const like = escapeLike(term);
  const rows = await deps.db
    .select({ user: users, rel: relationships })
    .from(users)
    .leftJoin(
      relationships,
      sql`${relationships.userLow} = least(${viewer.id}::uuid, ${users.id}) and ${relationships.userHigh} = greatest(${viewer.id}::uuid, ${users.id})`,
    )
    .where(
      and(
        ne(users.id, viewer.id),
        eq(users.status, 'active'),
        sql`(${users.username} like ${like + '%'} or ${users.displayName} ilike ${'%' + like + '%'})`,
        sql`not (coalesce(${relationships.state}, '') = 'blocked' and ${relationships.blockedBy} = ${users.id})`,
      ),
    )
    .orderBy(sql`(${users.username} like ${like + '%'}) desc`, users.username)
    .limit(20);
  return rows.map((r) => toRelationship(r.user, viewerState(r.rel, viewer.id) ?? 'none', r.rel));
}

async function listByState(
  deps: Deps,
  viewer: Viewer,
  where: ReturnType<typeof sql>,
  state: RelationshipState,
): Promise<Relationship[]> {
  const rows = await deps.db
    .select({ user: users, rel: relationships })
    .from(relationships)
    .innerJoin(
      users,
      sql`${users.id} = case when ${relationships.userLow} = ${viewer.id}::uuid then ${relationships.userHigh} else ${relationships.userLow} end`,
    )
    .where(
      and(
        sql`(${relationships.userLow} = ${viewer.id}::uuid or ${relationships.userHigh} = ${viewer.id}::uuid)`,
        where,
        state === 'blocked' ? sql`true` : eq(users.status, 'active'),
      ),
    )
    .orderBy(sql`lower(coalesce(nullif(${users.displayName}, ''), ${users.username}))`);
  return rows.map((r) => toRelationship(r.user, state, r.rel));
}

export const listFriends = (deps: Deps, viewer: Viewer) =>
  listByState(deps, viewer, sql`${relationships.state} = 'accepted'`, 'friends');

export const listRequests = (deps: Deps, viewer: Viewer, direction: 'in' | 'out') =>
  direction === 'out'
    ? listByState(
        deps,
        viewer,
        sql`${relationships.state} = 'pending' and ${relationships.requestedBy} = ${viewer.id}::uuid`,
        'request_sent',
      )
    : listByState(
        deps,
        viewer,
        sql`${relationships.state} = 'pending' and ${relationships.requestedBy} <> ${viewer.id}::uuid`,
        'request_received',
      );

export const listBlocks = (deps: Deps, viewer: Viewer) =>
  listByState(
    deps,
    viewer,
    sql`${relationships.state} = 'blocked' and ${relationships.blockedBy} = ${viewer.id}::uuid`,
    'blocked',
  );
