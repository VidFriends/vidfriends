// Collections (FR-FEED-07, BR-COL-1..3): a member's named lists of shares they received. Items
// are saved shares, so retention keeps their media (BR-MED-5); collections are private.
import { MAX_COLLECTIONS, MAX_COLLECTION_ITEMS, type Collection } from '@vidfriends/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { collectionItems, collections, shares } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, notFound } from '../../http/errors.js';
import { decodeCursor, encodeCursor } from '../../http/pagination.js';
import {
  collectionShareQuery,
  receivedVisible,
  shareQuery,
  toReceived,
  tsCursor,
  type Joined,
} from '../shares/service.js';

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string; cause?: { code?: string } })?.code === '23505' ||
  (err as { cause?: { code?: string } })?.cause?.code === '23505';

const nameTaken = () =>
  new ApiError('collection_name_taken', 'You already have a collection with this name');

/** BR-COL-3: items count only while the member can see the share (as in Saved). */
const visibleItemCount = sql<number>`(
  select count(*)::int from collection_items ci
  join shares s on s.id = ci.share_id
  join videos v on v.id = s.video_id
  join users u on u.id = s.sender_id
  where ci.collection_id = collections.id
    and s.recipient_id = collections.owner_id
    and s.delivered_at is not null
    and u.status = 'active'
    and v.state in ('ready', 'link_only', 'expired'))`;

async function load(
  db: DbOrTx,
  viewer: Viewer,
  opts: { ids?: string[]; shareId?: string | undefined } = {},
): Promise<Collection[]> {
  const contains = opts.shareId
    ? sql<boolean>`exists (select 1 from collection_items ci
        where ci.collection_id = collections.id and ci.share_id = ${opts.shareId}::uuid)`
    : sql<null>`null`;
  const rows = await db
    .select({ id: collections.id, name: collections.name, count: visibleItemCount, contains })
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, viewer.id),
        opts.ids ? inArray(collections.id, opts.ids) : undefined,
      ),
    )
    .orderBy(asc(sql`lower(${collections.name})`), asc(collections.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    item_count: r.count,
    contains: r.contains ?? null,
  }));
}

async function one(db: DbOrTx, viewer: Viewer, id: string): Promise<Collection> {
  const [c] = await load(db, viewer, { ids: [id] });
  if (!c) throw notFound();
  return c;
}

/** Locks the member's own collection for item writes; anything else is 404 (BR-GEN-3). */
async function ownCollection(tx: DbOrTx, viewer: Viewer, id: string) {
  const [row] = await tx
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.ownerId, viewer.id)))
    .for('update');
  if (!row) throw notFound();
}

/** BR-COL-2: only a share the member received and can currently see. */
async function receivedShare(tx: DbOrTx, viewer: Viewer, shareId: string) {
  const [row] = await shareQuery(tx)
    .where(and(eq(shares.id, shareId), receivedVisible(viewer.id)))
    .limit(1);
  if (!row) throw notFound();
  return row as Joined;
}

async function putItem(deps: Deps, tx: DbOrTx, collectionId: string, share: Joined) {
  const [present] = await tx
    .select({ id: collectionItems.shareId })
    .from(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.shareId, share.share.id),
      ),
    );
  if (present) return;
  const [count] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId));
  if ((count?.n ?? 0) >= MAX_COLLECTION_ITEMS)
    throw new ApiError('collection_full', 'This collection is full');
  const now = deps.clock.now();
  await tx.insert(collectionItems).values({ collectionId, shareId: share.share.id, addedAt: now });
  if (!share.share.saved)
    await tx.update(shares).set({ saved: true, savedAt: now }).where(eq(shares.id, share.share.id));
}

export const listCollections = (deps: Deps, viewer: Viewer, shareId?: string) =>
  load(deps.db, viewer, { shareId });

export async function createCollection(
  deps: Deps,
  viewer: Viewer,
  input: { name: string; share_id?: string | undefined },
): Promise<Collection> {
  const id = newId();
  try {
    await deps.db.transaction(async (tx) => {
      // Serialise this member's collection writes so the limit holds under concurrency.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`collections:${viewer.id}`}))`);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(collections)
        .where(eq(collections.ownerId, viewer.id));
      if ((count?.n ?? 0) >= MAX_COLLECTIONS)
        throw new ApiError('too_many_collections', 'Too many collections');
      const share = input.share_id ? await receivedShare(tx, viewer, input.share_id) : null;
      await tx
        .insert(collections)
        .values({ id, ownerId: viewer.id, name: input.name, createdAt: deps.clock.now() });
      if (share) await putItem(deps, tx, id, share);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
  return one(deps.db, viewer, id);
}

export async function renameCollection(
  deps: Deps,
  viewer: Viewer,
  id: string,
  name: string,
): Promise<Collection> {
  try {
    const updated = await deps.db
      .update(collections)
      .set({ name })
      .where(and(eq(collections.id, id), eq(collections.ownerId, viewer.id)))
      .returning({ id: collections.id });
    if (!updated.length) throw notFound();
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
  return one(deps.db, viewer, id);
}

export async function deleteCollection(deps: Deps, viewer: Viewer, id: string): Promise<void> {
  const deleted = await deps.db
    .delete(collections)
    .where(and(eq(collections.id, id), eq(collections.ownerId, viewer.id)))
    .returning({ id: collections.id });
  if (!deleted.length) throw notFound();
}

export async function addItem(
  deps: Deps,
  viewer: Viewer,
  id: string,
  shareId: string,
): Promise<Collection> {
  await deps.db.transaction(async (tx) => {
    await ownCollection(tx, viewer, id);
    await putItem(deps, tx, id, await receivedShare(tx, viewer, shareId));
  });
  return one(deps.db, viewer, id);
}

export async function removeItem(
  deps: Deps,
  viewer: Viewer,
  id: string,
  shareId: string,
): Promise<Collection> {
  await deps.db.transaction(async (tx) => {
    await ownCollection(tx, viewer, id);
    await tx
      .delete(collectionItems)
      .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.shareId, shareId)));
  });
  return one(deps.db, viewer, id);
}

/** BR-COL-3: visible shares in the collection, newest added first, keyset-paginated. */
export async function collectionPage(
  deps: Deps,
  viewer: Viewer,
  id: string,
  cursor: string | undefined,
  limit: number,
) {
  const collection = await one(deps.db, viewer, id);
  const c = tsCursor(decodeCursor(cursor, 2));
  const rows = (await collectionShareQuery(deps.db)
    .where(
      and(
        eq(collectionItems.collectionId, id),
        receivedVisible(viewer.id),
        c
          ? sql`(${collectionItems.addedAt}, ${shares.id}) < (${c.ts}::timestamptz, ${c.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(sql`${collectionItems.addedAt} desc`, sql`${shares.id} desc`)
    .limit(limit + 1)) as (Joined & { addedAt: Date })[];
  const last = rows.length > limit ? rows[limit - 1] : undefined;
  return {
    collection,
    items: rows.slice(0, limit).map(toReceived),
    next_cursor: last ? encodeCursor([last.addedAt.toISOString(), last.share.id]) : null,
  };
}
