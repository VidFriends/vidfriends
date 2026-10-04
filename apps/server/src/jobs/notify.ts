// notify.dispatch (SDD §4, FRD §9, ADR-0011): fans a notification out to the user's push targets
// according to their preferences. Payloads carry a generic title and opaque ids only (BR-NOT-3).
import type { NotificationType } from '@vidfriends/contracts';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Job } from 'pg-boss';
import { notifications, pushTargets, users } from '../db/schema.js';
import type { PushPayload, PushTargetRow } from '../infra/push/channels.js';
import type { Deps } from '../http/deps.js';
import { JOB_NOTIFY, pushPrefs } from '../modules/notifications/service.js';

export const PUSH_RETRY_LIMIT = 5;

export type NotifyJob =
  | { notification_id: string }
  | { user_id: string; actor_id: string; type: 'share_received' }
  | { retry: { payload: PushPayload; target_ids: string[]; attempt: number } };

function title(type: NotificationType, actor: string, count = 1): string {
  switch (type) {
    case 'share_received':
      return count > 1 ? `${actor} sent you ${count} videos` : `New video from ${actor}`;
    case 'reaction_received':
      return `${actor} reacted to your video`;
    case 'reply_received':
      return `New reply from ${actor}`;
    case 'friend_request_received':
      return `${actor} wants to be friends`;
    case 'friend_request_accepted':
      return `${actor} accepted your friend request`;
    case 'share_watched':
      return `${actor} watched your video`;
  }
}

function urlFor(type: NotificationType, shareId: string | null): string {
  if (type === 'friend_request_received' || type === 'friend_request_accepted') return '/friends';
  if (type === 'share_received') return '/inbox';
  return shareId ? `/shares/${shareId}` : '/notifications';
}

async function actorName(deps: Deps, actorId: string | null): Promise<string> {
  if (!actorId) return 'Someone';
  const [u] = await deps.db
    .select({ d: users.displayName, u: users.username })
    .from(users)
    .where(eq(users.id, actorId));
  return u ? u.d || u.u : 'Someone';
}

async function deliver(
  deps: Deps,
  userId: string | null,
  payload: PushPayload,
  targetIds: string[] | null,
  attempt: number,
) {
  const targets = (await deps.db
    .select()
    .from(pushTargets)
    .where(
      targetIds ? inArray(pushTargets.id, targetIds) : eq(pushTargets.userId, userId as string),
    )) as (PushTargetRow & {
    privatePreviews: boolean;
  })[];
  if (!targets.length) return;
  const senders = await deps.pushSenders();
  const failed: string[] = [];
  for (const target of targets) {
    const sender = senders[target.kind];
    if (!sender) continue;
    // "Private previews": no sender name on the lock screen (BR-NOT-3).
    const body = target.privatePreviews
      ? { ...payload, title: 'New activity on VidFriends' }
      : payload;
    const result = await sender.send(target, body);
    if (result === 'gone')
      await deps.db.delete(pushTargets).where(eq(pushTargets.id, target.id)); // BR-NOT-6
    else if (result === 'ok')
      await deps.db
        .update(pushTargets)
        .set({ lastSuccessAt: deps.clock.now() })
        .where(eq(pushTargets.id, target.id));
    else failed.push(target.id);
  }
  if (failed.length && attempt < PUSH_RETRY_LIMIT) {
    await deps.queue!.send(
      JOB_NOTIFY,
      { retry: { payload, target_ids: failed, attempt: attempt + 1 } },
      { startAfter: 30 * 2 ** attempt },
    );
  }
}

export async function handleNotify(deps: Deps, job: Job<NotifyJob>): Promise<void> {
  const data = job.data;
  if ('retry' in data)
    return deliver(deps, null, data.retry.payload, data.retry.target_ids, data.retry.attempt);

  if ('notification_id' in data) {
    const [n] = await deps.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, data.notification_id));
    if (!n || n.pushedAt || n.readAt) return; // idempotent; already read in-app means no push needed
    await deps.db
      .update(notifications)
      .set({ pushedAt: deps.clock.now() })
      .where(eq(notifications.id, n.id));
    if (!(await pushPrefs(deps.db, n.userId))[n.type]) return;
    const payload: PushPayload = {
      title: title(n.type, await actorName(deps, n.actorId)),
      data: { notification_id: n.id, url: urlFor(n.type, n.shareId) },
      tag: n.type,
    };
    return deliver(deps, n.userId, payload, null, 0);
  }

  // Coalesced share_received for one sender (BR-NOT-4).
  const pending = await deps.db
    .update(notifications)
    .set({ pushedAt: deps.clock.now() })
    .where(
      and(
        eq(notifications.userId, data.user_id),
        eq(notifications.actorId, data.actor_id),
        eq(notifications.type, 'share_received'),
        isNull(notifications.pushedAt),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  if (!pending.length) return;
  if (!(await pushPrefs(deps.db, data.user_id)).share_received) return;
  const payload: PushPayload = {
    title: title('share_received', await actorName(deps, data.actor_id), pending.length),
    data: { notification_id: pending[pending.length - 1]!.id, url: '/inbox' },
    tag: `share_received:${data.actor_id}`,
  };
  return deliver(deps, data.user_id, payload, null, 0);
}
