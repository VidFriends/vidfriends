// Notifications (FRD §9, ADR-0011): stored in-app first, in the same transaction as the event,
// then fanned out to push channels by the `notify.dispatch` job.
import {
  NOTIFICATION_TYPES,
  PUSH_DEFAULTS,
  type Notification,
  type NotificationType,
} from '@vidfriends/contracts';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { notificationPrefs, notifications, pushTargets, users } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import { publish } from '../../infra/realtime.js';
import { isAllowedWebPushEndpoint } from '../../infra/push/channels.js';
import type { Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { fieldError, notFound } from '../../http/errors.js';
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

export async function addPushTarget(
  deps: Deps,
  viewer: Viewer,
  input: {
    kind: 'webpush' | 'expo';
    endpoint: string;
    keys?: { p256dh: string; auth: string } | undefined;
    private_previews: boolean;
  },
) {
  if (input.kind === 'webpush') {
    if (!isAllowedWebPushEndpoint(input.endpoint))
      throw fieldError('endpoint', 'push_endpoint_not_allowed');
    if (!input.keys) throw fieldError('keys', 'required');
  } else if (!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/.test(input.endpoint)) {
    throw fieldError('endpoint', 'invalid_expo_token');
  }
  const now = deps.clock.now();
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
      set: {
        userId: viewer.id,
        p256dh: input.keys?.p256dh ?? null,
        auth: input.keys?.auth ?? null,
        privatePreviews: input.private_previews,
      },
    })
    .returning();
  return {
    target: {
      id: row!.id,
      kind: row!.kind,
      private_previews: row!.privatePreviews,
      created_at: row!.createdAt.toISOString(),
    },
  };
}

export async function deletePushTarget(deps: Deps, viewer: Viewer, id: string) {
  const deleted = await deps.db
    .delete(pushTargets)
    .where(and(eq(pushTargets.id, id), eq(pushTargets.userId, viewer.id)))
    .returning({ id: pushTargets.id });
  if (!deleted.length) throw notFound();
}
