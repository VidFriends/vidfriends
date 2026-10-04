// Groups of friends (FR-FRND-06, BR-GRP-1..3): a member's named selections for sending one video
// to several friends at once. Sending still creates one share per recipient (ADR-0010).
import { MAX_GROUPS, type FriendGroup } from '@vidfriends/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { friendGroupMembers, friendGroups, users } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, fieldError, notFound } from '../../http/errors.js';
import { toPublicUser } from '../accounts/serialize.js';
import { canSendTo } from './policy.js';

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string; cause?: { code?: string } })?.code === '23505' ||
  (err as { cause?: { code?: string } })?.cause?.code === '23505';

/** BR-GRP-1: members must be the owner's current friends. */
async function checkMembers(db: DbOrTx, viewer: Viewer, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (!(await canSendTo(db, viewer.id, id))) throw fieldError('member_ids', 'not_a_friend');
  }
  return unique;
}

/** BR-GRP-2: only members who are still friends are listed (and so sent to). */
async function load(deps: Deps, viewer: Viewer, groupIds?: string[]): Promise<FriendGroup[]> {
  const groups = await deps.db
    .select()
    .from(friendGroups)
    .where(
      and(
        eq(friendGroups.ownerId, viewer.id),
        groupIds ? inArray(friendGroups.id, groupIds) : undefined,
      ),
    )
    .orderBy(asc(sql`lower(${friendGroups.name})`));
  if (!groups.length) return [];
  const rows = await deps.db
    .select({ groupId: friendGroupMembers.groupId, user: users })
    .from(friendGroupMembers)
    .innerJoin(users, eq(users.id, friendGroupMembers.userId))
    .where(
      and(
        inArray(
          friendGroupMembers.groupId,
          groups.map((g) => g.id),
        ),
        eq(users.status, 'active'),
        sql`exists (select 1 from relationships r where r.state = 'accepted'
          and r.user_low = least(${viewer.id}::uuid, ${users.id})
          and r.user_high = greatest(${viewer.id}::uuid, ${users.id}))`,
      ),
    )
    .orderBy(asc(sql`lower(coalesce(nullif(${users.displayName}, ''), ${users.username}))`));
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    members: rows.filter((r) => r.groupId === g.id).map((r) => toPublicUser(r.user)),
  }));
}

export const listGroups = (deps: Deps, viewer: Viewer) => load(deps, viewer);

export async function createGroup(
  deps: Deps,
  viewer: Viewer,
  input: { name: string; member_ids: string[] },
): Promise<FriendGroup> {
  const id = newId();
  try {
    await deps.db.transaction(async (tx) => {
      // Serialise this member's group writes so the limit holds under concurrency.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`groups:${viewer.id}`}))`);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(friendGroups)
        .where(eq(friendGroups.ownerId, viewer.id));
      if ((count?.n ?? 0) >= MAX_GROUPS) throw new ApiError('too_many_groups', 'Too many groups');
      const members = await checkMembers(tx, viewer, input.member_ids);
      await tx
        .insert(friendGroups)
        .values({ id, ownerId: viewer.id, name: input.name, createdAt: deps.clock.now() });
      if (members.length)
        await tx
          .insert(friendGroupMembers)
          .values(members.map((userId) => ({ groupId: id, userId })));
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ApiError('group_name_taken', 'You already have a group with this name');
    throw err;
  }
  return (await load(deps, viewer, [id]))[0]!;
}

export async function updateGroup(
  deps: Deps,
  viewer: Viewer,
  id: string,
  input: { name?: string | undefined; member_ids?: string[] | undefined },
): Promise<FriendGroup> {
  try {
    await deps.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: friendGroups.id })
        .from(friendGroups)
        .where(and(eq(friendGroups.id, id), eq(friendGroups.ownerId, viewer.id)));
      if (!group) throw notFound();
      if (input.name !== undefined)
        await tx.update(friendGroups).set({ name: input.name }).where(eq(friendGroups.id, id));
      if (input.member_ids !== undefined) {
        const members = await checkMembers(tx, viewer, input.member_ids);
        await tx.delete(friendGroupMembers).where(eq(friendGroupMembers.groupId, id));
        if (members.length)
          await tx
            .insert(friendGroupMembers)
            .values(members.map((userId) => ({ groupId: id, userId })));
      }
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ApiError('group_name_taken', 'You already have a group with this name');
    throw err;
  }
  return (await load(deps, viewer, [id]))[0]!;
}

export async function deleteGroup(deps: Deps, viewer: Viewer, id: string): Promise<void> {
  const deleted = await deps.db
    .delete(friendGroups)
    .where(and(eq(friendGroups.id, id), eq(friendGroups.ownerId, viewer.id)))
    .returning({ id: friendGroups.id });
  if (!deleted.length) throw notFound();
}
