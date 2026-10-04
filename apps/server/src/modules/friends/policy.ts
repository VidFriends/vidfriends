// Relationship policy (SDD §3 layer 2), reused by services and the authz-matrix tests.
import { and, eq, sql } from 'drizzle-orm';
import { relationships, users } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';

export type RelationshipRow = typeof relationships.$inferSelect;

export function pair(a: string, b: string): [string, string] {
  return (a < b ? [a, b] : [b, a]) as [string, string];
}

export async function getRelationship(
  db: DbOrTx,
  a: string,
  b: string,
): Promise<RelationshipRow | null> {
  const [low, high] = pair(a, b);
  const [row] = await db
    .select()
    .from(relationships)
    .where(and(eq(relationships.userLow, low), eq(relationships.userHigh, high)))
    .limit(1);
  return row ?? null;
}

/** canSendTo(viewer, user): accepted friendship, not blocked, target active. */
export async function canSendTo(db: DbOrTx, viewerId: string, userId: string): Promise<boolean> {
  if (viewerId === userId) return false;
  const [low, high] = pair(viewerId, userId);
  const rows = await db
    .select({ id: users.id })
    .from(relationships)
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        eq(relationships.userLow, low),
        eq(relationships.userHigh, high),
        eq(relationships.state, 'accepted'),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** SQL predicate: no block between :viewer and the user in `otherColumn` (either direction). */
export function notBlockedSql(viewerId: string, otherColumn: unknown) {
  return sql`not exists (select 1 from relationships rb where rb.state = 'blocked'
    and rb.user_low = least(${viewerId}::uuid, ${otherColumn}) and rb.user_high = greatest(${viewerId}::uuid, ${otherColumn}))`;
}
