// Invites (FR-INV-01..03, BR-INV-1..5): 256-bit codes stored as SHA-256, shown once at creation.
import type { Invite } from '@vidfriends/contracts';
import { and, desc, eq, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { invites, users } from '../../db/schema.js';
import { DAY } from '../../infra/clock.js';
import { newId } from '../../infra/ids.js';
import { hashToken, newToken } from '../../infra/tokens.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, notFound } from '../../http/errors.js';
import { decodeCursor, encodeCursor } from '../../http/pagination.js';
import { audit } from '../audit/service.js';
import { toPublicUser } from '../accounts/serialize.js';
import { getSettings } from '../settings/service.js';

type InviteRow = typeof invites.$inferSelect;
type Creator = Pick<typeof users.$inferSelect, 'id' | 'username' | 'displayName' | 'avatarKey'>;

function status(row: InviteRow, now: Date): Invite['status'] {
  if (row.revokedAt) return 'revoked';
  if (row.uses >= row.maxUses) return 'exhausted';
  if (row.expiresAt <= now) return 'expired';
  return 'active';
}

function toInvite(row: InviteRow, creator: Creator, now: Date): Invite {
  return {
    id: row.id,
    created_by: toPublicUser(creator),
    max_uses: row.maxUses,
    uses: row.uses,
    auto_friend: row.autoFriend,
    expires_at: row.expiresAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    status: status(row, now),
  };
}

export function joinUrl(publicUrl: string, code: string): string {
  return `${publicUrl}/join/${code}`;
}

export async function canInvite(deps: Deps, viewer: Viewer): Promise<boolean> {
  if (viewer.role === 'admin') return true;
  return (await getSettings(deps.db)).members_can_invite;
}

export async function createInvite(
  deps: Deps,
  viewer: Viewer,
  input: { maxUses: number; expiresInDays: number; autoFriend: boolean; ip: string },
) {
  if (!(await canInvite(deps, viewer))) {
    throw new ApiError('forbidden', 'Only admins can create invites on this instance');
  }
  const now = deps.clock.now();
  const code = newToken();
  const [row] = await deps.db
    .insert(invites)
    .values({
      id: newId(),
      codeHash: hashToken(code),
      createdBy: viewer.id,
      maxUses: input.maxUses,
      autoFriend: input.autoFriend,
      expiresAt: new Date(now.getTime() + input.expiresInDays * DAY),
      createdAt: now,
    })
    .returning();
  if (!row) throw new Error('insert failed');
  await audit(deps.db, {
    actorId: viewer.id,
    action: 'invite.created',
    targetType: 'invite',
    targetId: row.id,
    metadata: {
      max_uses: input.maxUses,
      expires_in_days: input.expiresInDays,
      auto_friend: input.autoFriend,
    },
    ip: input.ip,
  });
  const [creator] = await deps.db.select().from(users).where(eq(users.id, viewer.id));
  return {
    invite: toInvite(row, creator as Creator, now),
    code,
    join_url: joinUrl(deps.env.PUBLIC_URL, code),
  };
}

export async function listInvites(
  deps: Deps,
  viewer: Viewer,
  input: { scope: 'mine' | 'all'; cursor?: string | undefined; limit: number },
) {
  if (input.scope === 'all' && viewer.role !== 'admin') {
    throw new ApiError('forbidden', 'Admin only');
  }
  const creator = alias(users, 'creator');
  const cursor = decodeCursor(input.cursor, 1);
  const conditions = [];
  if (input.scope === 'mine') conditions.push(eq(invites.createdBy, viewer.id));
  // UUIDv7 ids are time-ordered, so the id alone is a stable keyset for "newest first".
  if (cursor) conditions.push(lt(invites.id, cursor[0] as string));
  const rows = await deps.db
    .select({ invite: invites, creator })
    .from(invites)
    .innerJoin(creator, eq(creator.id, invites.createdBy))
    .where(and(...conditions))
    .orderBy(desc(invites.id))
    .limit(input.limit + 1);
  const now = deps.clock.now();
  const items = rows.slice(0, input.limit).map((r) => toInvite(r.invite, r.creator, now));
  const last = rows.length > input.limit ? rows[input.limit - 1] : undefined;
  return { items, next_cursor: last ? encodeCursor([last.invite.id]) : null };
}

export async function revokeInvite(deps: Deps, viewer: Viewer, id: string, ip: string) {
  const [row] = await deps.db.select().from(invites).where(eq(invites.id, id)).limit(1);
  // BR-GEN-3: invites the caller may not manage are reported as not found.
  if (!row || (row.createdBy !== viewer.id && viewer.role !== 'admin')) throw notFound();
  if (!row.revokedAt) {
    await deps.db.update(invites).set({ revokedAt: deps.clock.now() }).where(eq(invites.id, id));
    await audit(deps.db, {
      actorId: viewer.id,
      action: 'invite.revoked',
      targetType: 'invite',
      targetId: id,
      ip,
    });
  }
}

export async function previewInvite(deps: Deps, code: string) {
  const creator = alias(users, 'creator');
  const [row] = await deps.db
    .select({ invite: invites, creator })
    .from(invites)
    .innerJoin(creator, eq(creator.id, invites.createdBy))
    .where(eq(invites.codeHash, hashToken(code)))
    .limit(1);
  if (
    !row ||
    status(row.invite, deps.clock.now()) !== 'active' ||
    row.creator.status !== 'active'
  ) {
    throw new ApiError('invite_invalid', 'This invite is not valid');
  }
  return {
    inviter_display_name: row.creator.displayName || row.creator.username,
    expires_at: row.invite.expiresAt.toISOString(),
  };
}
