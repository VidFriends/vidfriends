// Administration (FRD §10, WF-ADM-1..6, BR-ADM-1/2) and account lifecycle (WF-ACCT-3, FR-ACCT-04).
// Admin queries only ever return counts about members' activity, never content (BR-ADM-1).
import type { AdminUser, InstanceSettings, InstanceSettingsPatch } from '@vidfriends/contracts';
import { InstanceSettings as SettingsSchema } from '@vidfriends/contracts';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  auditLog,
  passwordResets,
  sessions,
  uploads,
  users,
  VIDEO_STATES,
  videos,
} from '../../db/schema.js';
import { DAY } from '../../infra/clock.js';
import type { DbOrTx } from '../../infra/db.js';
import { hashToken, newToken } from '../../infra/tokens.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, fieldError, notFound } from '../../http/errors.js';
import { decodeCursor, encodeCursor } from '../../http/pagination.js';
import { toPublicUser } from '../accounts/serialize.js';
import { audit } from '../audit/service.js';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../auth/passwords.js';
import { revokeAllSessions } from '../auth/sessions.js';
import { getSettings, updateSettings } from '../settings/service.js';

export const JOB_PURGE_ACCOUNT_MEDIA = 'account.purge_media';
export const JOB_RETENTION = 'retention.purge';
export const RESET_TTL_MS = DAY;

type UserRow = typeof users.$inferSelect;

const sentCount = sql<number>`(select count(*)::int from shares s where s.sender_id = ${users.id})`;
const receivedCount = sql<number>`(select count(*)::int from shares s where s.recipient_id = ${users.id})`;

function toAdminUser(u: UserRow, sent: number, received: number): AdminUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.displayName,
    role: u.role,
    status: u.status,
    created_at: u.createdAt.toISOString(),
    last_active_at: u.lastActiveAt?.toISOString() ?? null,
    storage_bytes: u.storageBytes,
    quota_bytes_override: u.quotaBytesOverride,
    shares_sent: sent,
    shares_received: received,
  };
}

async function adminUser(db: DbOrTx, id: string): Promise<AdminUser> {
  const [row] = await db
    .select({ u: users, sent: sentCount, received: receivedCount })
    .from(users)
    .where(eq(users.id, id));
  if (!row) throw notFound();
  return toAdminUser(row.u, row.sent, row.received);
}

export async function listUsers(
  deps: Deps,
  input: {
    q?: string | undefined;
    status?: 'active' | 'suspended' | undefined;
    cursor?: string | undefined;
    limit: number;
  },
) {
  const c = decodeCursor(input.cursor, 1);
  const q = input.q?.trim().toLowerCase();
  const like = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
  const rows = await deps.db
    .select({ u: users, sent: sentCount, received: receivedCount })
    .from(users)
    .where(
      and(
        like
          ? or(sql`${users.username} like ${like}`, sql`${users.displayName} ilike ${like}`)
          : undefined,
        input.status ? eq(users.status, input.status) : undefined,
        c ? lt(users.id, c[0] as string) : undefined,
      ),
    )
    .orderBy(desc(users.id))
    .limit(input.limit + 1);
  return {
    items: rows.slice(0, input.limit).map((r) => toAdminUser(r.u, r.sent, r.received)),
    next_cursor: rows.length > input.limit ? encodeCursor([rows[input.limit - 1]!.u.id]) : null,
  };
}

/** Serialises admin-changing operations and enforces "never the last admin" (WF-ADM-1). */
async function assertNotLastAdmin(tx: DbOrTx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vidfriends.admins'))`);
  const admins = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
  if (admins.length <= 1 && admins.some((a) => a.id === userId)) {
    throw new ApiError('last_admin', 'This is the only admin. Promote someone else first.');
  }
}

export async function updateUser(
  deps: Deps,
  actor: Viewer,
  id: string,
  patch: {
    status?: 'active' | 'suspended' | undefined;
    role?: 'member' | 'admin' | undefined;
    quota_bytes_override?: number | null | undefined;
  },
  ip: string,
): Promise<AdminUser> {
  await deps.db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!user) throw notFound();
    const demoting = patch.role === 'member' && user.role === 'admin';
    const suspending = patch.status === 'suspended' && user.status === 'active';
    if ((demoting || suspending) && user.role === 'admin') await assertNotLastAdmin(tx, id);
    const set: Partial<UserRow> = { updatedAt: deps.clock.now() };
    if (patch.status) set.status = patch.status;
    if (patch.role) set.role = patch.role;
    if (patch.quota_bytes_override !== undefined)
      set.quotaBytesOverride = patch.quota_bytes_override;
    await tx.update(users).set(set).where(eq(users.id, id));
    // BR-SES-2: suspension and role changes revoke every session; suspension takes effect at once.
    let revoked = 0;
    if (suspending || (patch.role && patch.role !== user.role))
      revoked = await revokeAllSessions(tx, id);
    const changes: Record<string, unknown> = {};
    if (patch.status && patch.status !== user.status) changes.status = patch.status;
    if (patch.role && patch.role !== user.role) changes.role = patch.role;
    if (patch.quota_bytes_override !== undefined)
      changes.quota_bytes_override = patch.quota_bytes_override;
    await audit(tx, {
      actorId: actor.id,
      action: 'admin.user_updated',
      targetType: 'user',
      targetId: id,
      metadata: { ...changes, sessions_revoked: revoked },
      ip,
    });
  });
  return adminUser(deps.db, id);
}

/**
 * WF-ACCT-3: hard delete in one transaction (FK cascades remove sessions, push targets, invites,
 * relationships, sent and received shares with their conversations, notifications), then purge the
 * user's media asynchronously. The audit entry records only the deleted user id.
 */
export async function deleteAccount(
  deps: Deps,
  userId: string,
  actorId: string | null,
  ip: string,
) {
  await deps.db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!user) throw notFound();
    if (user.role === 'admin') await assertNotLastAdmin(tx, userId);
    const added = await tx.select({ id: videos.id }).from(videos).where(eq(videos.addedBy, userId));
    const pending = await tx
      .select({ key: uploads.objectKey })
      .from(uploads)
      .where(and(eq(uploads.userId, userId), eq(uploads.state, 'pending')));
    const keys = [...(user.avatarKey ? [user.avatarKey] : []), ...pending.map((p) => p.key)];
    await tx.delete(users).where(eq(users.id, userId));
    await audit(tx, {
      actorId: actorId === userId ? null : actorId,
      action: 'user.deleted',
      targetType: 'user',
      targetId: userId,
      ip,
    });
    await deps.queue?.send(
      JOB_PURGE_ACCOUNT_MEDIA,
      { video_ids: added.map((v) => v.id), keys },
      { tx },
    );
  });
}

export async function deleteSelf(
  deps: Deps,
  viewer: Viewer,
  password: string,
  ip: string,
  c: { header(n: string, v: string): void },
) {
  // WF-ACCT-3: 3 attempts per hour.
  const limit = deps.rateLimiter.hit(`delete-account:${viewer.id}`, 3, 60 * 60 * 1000);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfterSeconds));
    throw new ApiError('rate_limited', 'Too many attempts');
  }
  const [user] = await deps.db.select().from(users).where(eq(users.id, viewer.id));
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new ApiError('invalid_credentials', 'Wrong password');
  }
  await deleteAccount(deps, viewer.id, viewer.id, ip);
}

/** WF-ADM-4: single-use link, valid 24 h, given to the member out of band. */
export async function createPasswordReset(deps: Deps, actor: Viewer, id: string, ip: string) {
  const [user] = await deps.db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!user) throw notFound();
  const token = newToken();
  const expiresAt = new Date(deps.clock.now().getTime() + RESET_TTL_MS);
  await deps.db.insert(passwordResets).values({
    tokenHash: hashToken(token),
    userId: id,
    createdBy: actor.id,
    expiresAt,
    createdAt: deps.clock.now(),
  });
  await audit(deps.db, {
    actorId: actor.id,
    action: 'admin.password_reset_created',
    targetType: 'user',
    targetId: id,
    ip,
  });
  return {
    reset_url: `${deps.env.PUBLIC_URL}/reset/${token}`,
    expires_at: expiresAt.toISOString(),
  };
}

export async function usePasswordReset(deps: Deps, token: string, newPassword: string, ip: string) {
  await deps.db.transaction(async (tx) => {
    const now = deps.clock.now();
    const [reset] = await tx
      .select({ r: passwordResets, u: users })
      .from(passwordResets)
      .innerJoin(users, eq(users.id, passwordResets.userId))
      .where(eq(passwordResets.tokenHash, hashToken(token)))
      .for('update');
    if (!reset || reset.r.usedAt || reset.r.expiresAt <= now) {
      throw new ApiError(
        'reset_invalid',
        'This reset link is not valid. Ask your admin for a new one.',
      );
    }
    checkPasswordPolicy(newPassword, reset.u.username, 'new_password');
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: now })
      .where(eq(users.id, reset.u.id));
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(eq(passwordResets.tokenHash, reset.r.tokenHash));
    const revoked = await revokeAllSessions(tx, reset.u.id);
    await audit(tx, {
      actorId: reset.u.id,
      action: 'user.password_reset_used',
      targetType: 'user',
      targetId: reset.u.id,
      metadata: { sessions_revoked: revoked },
      ip,
    });
  });
}

export async function getAdminSettings(deps: Deps): Promise<InstanceSettings> {
  return getSettings(deps.db);
}

/** WF-ADM-3: validated against the full schema and audited. */
export async function patchSettings(
  deps: Deps,
  actor: Viewer,
  patch: InstanceSettingsPatch,
  ip: string,
) {
  const current = await getSettings(deps.db);
  const merged = SettingsSchema.safeParse({ ...current, ...patch });
  if (!merged.success) {
    const issue = merged.error.issues[0];
    throw fieldError(String(issue?.path[0] ?? '_'), 'invalid', issue?.message);
  }
  if (merged.data.session_idle_days > merged.data.session_absolute_days) {
    throw fieldError('session_idle_days', 'idle_exceeds_absolute');
  }
  const changed = Object.fromEntries(
    Object.entries(patch).filter(
      ([k, v]) => JSON.stringify(current[k as keyof InstanceSettings]) !== JSON.stringify(v),
    ),
  );
  await deps.db.transaction(async (tx) => {
    await updateSettings(tx, changed as Partial<InstanceSettings>, actor.id);
    if (Object.keys(changed).length) {
      await audit(tx, {
        actorId: actor.id,
        action: 'admin.settings_changed',
        metadata: changed,
        ip,
      });
    }
  });
  return getSettings(deps.db);
}

/** Next 03:30 UTC (the daily retention schedule). */
export function nextRetentionRun(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 30));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function storageOverview(deps: Deps) {
  const [total] = await deps.db
    .select({ bytes: sql<string>`coalesce(sum(${users.storageBytes}), 0)` })
    .from(users);
  const top = await deps.db
    .select()
    .from(users)
    .where(sql`${users.storageBytes} > 0`)
    .orderBy(desc(users.storageBytes))
    .limit(50);
  const byState = await deps.db
    .select({ state: videos.state, count: sql<number>`count(*)::int` })
    .from(videos)
    .groupBy(videos.state);
  const settings = await getSettings(deps.db);
  return {
    total_bytes: Number(total?.bytes ?? 0),
    per_user: top.map((u) => ({ user: toPublicUser(u), bytes: u.storageBytes })),
    videos_by_state: Object.fromEntries(
      VIDEO_STATES.map((state) => [state, byState.find((r) => r.state === state)?.count ?? 0]),
    ) as Record<(typeof VIDEO_STATES)[number], number>,
    retention_days: settings.retention_days,
    next_retention_run: nextRetentionRun(deps.clock.now()).toISOString(),
  };
}

export async function runRetentionNow(deps: Deps, actor: Viewer, ip: string) {
  if (!deps.queue) throw new ApiError('unavailable', 'Background jobs are not running');
  await deps.queue.send(JOB_RETENTION, { manual: true });
  await audit(deps.db, { actorId: actor.id, action: 'admin.retention_run', ip });
}

export async function listAudit(
  deps: Deps,
  input: {
    actor?: string | undefined;
    action?: string | undefined;
    before?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  },
) {
  const actor = alias(users, 'actor');
  const c = decodeCursor(input.cursor, 1);
  const rows = await deps.db
    .select({ a: auditLog, actor })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .where(
      and(
        input.actor ? eq(auditLog.actorId, input.actor) : undefined,
        input.action
          ? sql`${auditLog.action} like ${input.action.replace(/[\\%_]/g, (ch) => `\\${ch}`) + '%'}`
          : undefined,
        input.before ? lt(auditLog.createdAt, new Date(input.before)) : undefined,
        c ? lt(auditLog.id, Number(c[0])) : undefined,
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(input.limit + 1);
  return {
    items: rows.slice(0, input.limit).map((r) => ({
      id: r.a.id,
      actor: r.actor ? toPublicUser(r.actor) : null,
      actor_id: r.a.actorId,
      action: r.a.action,
      target_type: r.a.targetType,
      target_id: r.a.targetId,
      metadata: (r.a.metadata ?? {}) as Record<string, unknown>,
      ip: r.a.ip,
      created_at: r.a.createdAt.toISOString(),
    })),
    next_cursor: rows.length > input.limit ? encodeCursor([rows[input.limit - 1]!.a.id]) : null,
  };
}

export async function listSessions(deps: Deps, viewer: Viewer) {
  const now = deps.clock.now();
  const rows = await deps.db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, viewer.id),
        sql`${sessions.idleExpiresAt} > ${now}`,
        sql`${sessions.absoluteExpiresAt} > ${now}`,
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));
  return {
    items: rows.map((s) => ({
      id: s.id,
      client: s.client,
      user_agent: s.userAgent,
      created_at: s.createdAt.toISOString(),
      last_seen_at: s.lastSeenAt.toISOString(),
      current: s.id === viewer.sessionId,
    })),
  };
}

export async function revokeOwnSession(deps: Deps, viewer: Viewer, id: string, ip: string) {
  const deleted = await deps.db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, viewer.id)))
    .returning({ id: sessions.id });
  if (!deleted.length) throw notFound();
  await audit(deps.db, {
    actorId: viewer.id,
    action: 'auth.session_revoked',
    targetType: 'session',
    targetId: id,
    ip,
  });
}

/** Expired password-reset rows (housekeeping). */
export async function purgeResets(db: DbOrTx, now: Date) {
  await db
    .delete(passwordResets)
    .where(or(lt(passwordResets.expiresAt, now), sql`${passwordResets.usedAt} is not null`));
}
