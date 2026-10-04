// Notifications (FRD §9, ADR-0011): stored in-app first, in the same transaction as the event,
// then fanned out to push channels by the `notify.dispatch` job.
import {
  MAX_SERVER_PUSH_TARGETS,
  NOTIFICATION_TYPES,
  PUSH_DEFAULTS,
  type Notification,
  type NotificationType,
  type PushTarget,
} from '@vidfriends/contracts';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { notificationPrefs, notifications, pushTargets, users } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import { publish } from '../../infra/realtime.js';
import {
  isAllowedWebPushEndpoint,
  PUSH_SECRET_NAME,
  type PushKind,
} from '../../infra/push/channels.js';
import { checkPushUrl } from '../../infra/push/egress.js';
import { encryptSecret } from '../../infra/secrets.js';
import { assertPublicHost } from '../videos/url.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError, fieldError, notFound } from '../../http/errors.js';
import { decodeCursor, encodeCursor } from '../../http/pagination.js';
import { toPublicUser } from '../accounts/serialize.js';

export const JOB_NOTIFY = 'notify.dispatch';
/** BR-NOT-4: share_received pushes from one sender within 2 minutes are coalesced. */
export const COALESCE_SECONDS = 120;

export interface NewNotification {
  userId: string;
  type: NotificationType;
  actorId: string | null;
  shareId?: string | null;
  data?: Record<string, string>;
}

/** Inserts the notification and enqueues its push dispatch in the same transaction. */
export async function notify(deps: Deps, tx: DbOrTx, n: NewNotification): Promise<string> {
  const id = newId();
  await tx.insert(notifications).values({
    id,
    userId: n.userId,
    type: n.type,
    actorId: n.actorId,
    shareId: n.shareId ?? null,
    data: n.data ?? {},
    createdAt: deps.clock.now(),
  });
  // BR-NOT-7: open streams hear about it once the transaction commits.
  await publish(tx, n.userId, {
    type: 'notification',
    notification_type: n.type,
    share_id: n.shareId ?? null,
  });
  if (deps.queue) {
    if (n.type === 'share_received' && n.actorId) {
      // One job per recipient+sender per 2-minute slot; a later one lands in the next slot and
      // summarises everything not yet pushed ("Sam sent you 3 videos").
      await deps.queue.send(
        JOB_NOTIFY,
        { user_id: n.userId, actor_id: n.actorId, type: n.type },
        {
          tx,
          singletonKey: `notify:${n.userId}:${n.actorId}`,
          singletonSeconds: COALESCE_SECONDS,
          singletonNextSlot: true,
        },
      );
    } else {
      await deps.queue.send(JOB_NOTIFY, { notification_id: id }, { tx });
    }
  }
  return id;
}

type Row = typeof notifications.$inferSelect;
type ActorRow = Pick<
  typeof users.$inferSelect,
  'id' | 'username' | 'displayName' | 'avatarKey'
> | null;

function toNotification(row: Row, actor: ActorRow): Notification {
  return {
    id: row.id,
    type: row.type,
    actor: actor ? toPublicUser(actor) : null,
    share_id: row.shareId,
    data: (row.data ?? {}) as Record<string, string>,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function list(deps: Deps, viewer: Viewer, cursor: string | undefined, limit: number) {
  const actor = alias(users, 'actor');
  const c = decodeCursor(cursor, 1);
  const rows = await deps.db
    .select({ n: notifications, actor })
    .from(notifications)
    .leftJoin(actor, eq(actor.id, notifications.actorId))
    .where(
      and(
        eq(notifications.userId, viewer.id),
        c ? lt(notifications.id, c[0] as string) : undefined,
      ),
    )
    .orderBy(desc(notifications.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((r) => toNotification(r.n, r.actor));
  return { items, next_cursor: rows.length > limit ? encodeCursor([rows[limit - 1]!.n.id]) : null };
}

export async function unreadCount(deps: Deps, viewer: Viewer): Promise<number> {
  const [row] = await deps.db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, viewer.id), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markRead(deps: Deps, viewer: Viewer, ids: string[] | 'all') {
  const updated = await deps.db
    .update(notifications)
    .set({ readAt: deps.clock.now() })
    .where(
      and(
        eq(notifications.userId, viewer.id),
        isNull(notifications.readAt),
        ids === 'all' ? undefined : inArray(notifications.id, ids),
      ),
    )
    .returning({ id: notifications.id });
  // Other devices refresh their badge (BR-NOT-7).
  if (updated.length) await publish(deps.db, viewer.id, { type: 'notifications_read' });
}

/** BR-NOT-5: reading the referenced item marks its notifications read. */
export async function markShareRead(db: DbOrTx, userId: string, shareId: string, now: Date) {
  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.shareId, shareId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  if (updated.length) await publish(db, userId, { type: 'notifications_read' });
}

export async function pushPrefs(
  db: DbOrTx,
  userId: string,
): Promise<Record<NotificationType, boolean>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.userId, userId), eq(notificationPrefs.channel, 'push')));
  const prefs = { ...PUSH_DEFAULTS };
  for (const r of rows) {
    if ((NOTIFICATION_TYPES as readonly string[]).includes(r.type))
      prefs[r.type as NotificationType] = r.enabled;
  }
  return prefs;
}

export async function setPushPrefs(
  deps: Deps,
  viewer: Viewer,
  patch: Partial<Record<NotificationType, boolean>>,
) {
  for (const [type, enabled] of Object.entries(patch)) {
    if (enabled === undefined) continue;
    await deps.db
      .insert(notificationPrefs)
      .values({ userId: viewer.id, type, channel: 'push', enabled })
      .onConflictDoUpdate({
        target: [notificationPrefs.userId, notificationPrefs.type, notificationPrefs.channel],
        set: { enabled },
      });
  }
  return { push: await pushPrefs(deps.db, viewer.id) };
}

type PushRow = typeof pushTargets.$inferSelect;

/** What a member sees for a target: host and path for ntfy/Gotify, never tokens (ADR-0020). */
function labelFor(row: Pick<PushRow, 'kind' | 'endpoint'>): string {
  if (row.kind === 'webpush') return 'Browser';
  if (row.kind === 'expo') return 'VidFriends app';
  try {
    const url = new URL(row.endpoint);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return row.kind;
  }
}

export function toPushTarget(row: PushRow): PushTarget {
  return {
    id: row.id,
    kind: row.kind,
    label: labelFor(row),
    private_previews: row.privatePreviews,
    created_at: row.createdAt.toISOString(),
    last_success_at: row.lastSuccessAt?.toISOString() ?? null,
  };
}

/** ntfy/Gotify URL rules (ADR-0020): https on a public address, or a host the operator listed. */
async function checkServerEndpoint(deps: Deps, endpoint: string) {
  const check = checkPushUrl(endpoint, deps.env.PUSH_PRIVATE_HOSTS);
  if (check === 'invalid') throw fieldError('endpoint', 'invalid_url');
  if (check === 'insecure') throw fieldError('endpoint', 'push_endpoint_not_allowed');
  const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (deps.env.PUSH_PRIVATE_HOSTS.includes(host)) return;
  try {
    await assertPublicHost(host, deps.net.lookup);
  } catch {
    throw fieldError('endpoint', 'push_endpoint_not_allowed');
  }
}

export async function addPushTarget(
  deps: Deps,
  viewer: Viewer,
  input: {
    kind: PushKind;
    endpoint: string;
    keys?: { p256dh: string; auth: string } | undefined;
    token?: string | undefined;
    private_previews: boolean;
  },
) {
  const now = deps.clock.now();
  if (input.kind === 'ntfy' || input.kind === 'gotify') {
    await checkServerEndpoint(deps, input.endpoint);
    if (input.kind === 'gotify' && !input.token) throw fieldError('token', 'required');
    const [count] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(pushTargets)
      .where(and(eq(pushTargets.userId, viewer.id), inArray(pushTargets.kind, ['ntfy', 'gotify'])));
    const secret = input.token
      ? encryptSecret(deps.env.APP_SECRET, PUSH_SECRET_NAME, input.token)
      : null;
    const [existing] = await deps.db
      .select({ id: pushTargets.id })
      .from(pushTargets)
      .where(
        and(
          eq(pushTargets.userId, viewer.id),
          eq(pushTargets.endpoint, input.endpoint),
          inArray(pushTargets.kind, ['ntfy', 'gotify']),
        ),
      );
    if (!existing && (count?.n ?? 0) >= MAX_SERVER_PUSH_TARGETS) {
      throw new ApiError('too_many_push_targets', 'Too many ntfy or Gotify targets');
    }
    const [row] = existing
      ? await deps.db
          .update(pushTargets)
          .set({ kind: input.kind, secret, privatePreviews: input.private_previews })
          .where(eq(pushTargets.id, existing.id))
          .returning()
      : await deps.db
          .insert(pushTargets)
          .values({
            id: newId(),
            userId: viewer.id,
            kind: input.kind,
            endpoint: input.endpoint,
            secret,
            privatePreviews: input.private_previews,
            createdAt: now,
          })
          .returning();
    return { target: toPushTarget(row!) };
  }
  if (input.kind === 'webpush') {
    if (!isAllowedWebPushEndpoint(input.endpoint))
      throw fieldError('endpoint', 'push_endpoint_not_allowed');
    if (!input.keys) throw fieldError('keys', 'required');
  } else if (!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/.test(input.endpoint)) {
    throw fieldError('endpoint', 'invalid_expo_token');
  }
  const [row] = await deps.db
    .insert(pushTargets)
    .values({
      id: newId(),
      userId: viewer.id,
      kind: input.kind,
      endpoint: input.endpoint,
      p256dh: input.keys?.p256dh ?? null,
      auth: input.keys?.auth ?? null,
      privatePreviews: input.private_previews,
      createdAt: now,
    })
    .onConflictDoUpdate({
      // A browser re-subscribing (or another account on the same device) takes the endpoint over.
      target: pushTargets.endpoint,
      targetWhere: sql`${pushTargets.kind} in ('webpush','expo')`,
      set: {
        userId: viewer.id,
        p256dh: input.keys?.p256dh ?? null,
        auth: input.keys?.auth ?? null,
        privatePreviews: input.private_previews,
      },
    })
    .returning();
  return { target: toPushTarget(row!) };
}

export async function listPushTargets(deps: Deps, viewer: Viewer) {
  const rows = await deps.db
    .select()
    .from(pushTargets)
    .where(eq(pushTargets.userId, viewer.id))
    .orderBy(desc(pushTargets.createdAt));
  return { items: rows.map(toPushTarget) };
}

/** BR-NOT-8: a test push, 5 per 10 minutes per member. */
export async function testPushTarget(deps: Deps, viewer: Viewer, id: string) {
  const [row] = await deps.db
    .select()
    .from(pushTargets)
    .where(and(eq(pushTargets.id, id), eq(pushTargets.userId, viewer.id)));
  if (!row) throw notFound();
  const limit = deps.rateLimiter.hit(`push-test:${viewer.id}`, 5, 10 * 60_000);
  if (!limit.allowed) throw new ApiError('rate_limited', 'Too many test pushes');
  const sender = (await deps.pushSenders())[row.kind];
  if (!sender) return { result: 'error' as const };
  const result = await sender.send(row, {
    title: 'Test notification from VidFriends',
    data: { notification_id: row.id, url: '/settings' },
    tag: 'test',
  });
  if (result === 'gone') await deps.db.delete(pushTargets).where(eq(pushTargets.id, row.id));
  else if (result === 'ok')
    await deps.db
      .update(pushTargets)
      .set({ lastSuccessAt: deps.clock.now() })
      .where(eq(pushTargets.id, row.id));
  return { result };
}

export async function deletePushTarget(deps: Deps, viewer: Viewer, id: string) {
  const deleted = await deps.db
    .delete(pushTargets)
    .where(and(eq(pushTargets.id, id), eq(pushTargets.userId, viewer.id)))
    .returning({ id: pushTargets.id });
  if (!deleted.length) throw notFound();
}
