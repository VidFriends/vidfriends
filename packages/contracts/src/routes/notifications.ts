import { z } from 'zod';
import { Id, PageQuery, Timestamp, page } from '../common.js';
import { defineRoute } from '../route.js';
import { PublicUser } from './accounts.js';

/** BR-NOT-1. */
export const NOTIFICATION_TYPES = [
  'share_received',
  'reaction_received',
  'reply_received',
  'friend_request_received',
  'friend_request_accepted',
  'share_watched',
] as const;
export const NotificationType = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationType>;

/** BR-NOT-2: push is on by default for every type except `share_watched`. */
export const PUSH_DEFAULTS: Record<NotificationType, boolean> = {
  share_received: true,
  reaction_received: true,
  reply_received: true,
  friend_request_received: true,
  friend_request_accepted: true,
  share_watched: false,
};

export const Notification = z.object({
  id: Id,
  type: NotificationType,
  actor: PublicUser.nullable(),
  share_id: Id.nullable(),
  /** Extra non-content data, e.g. the reaction emoji. Never notes or reply text. */
  data: z.record(z.string(), z.string()),
  read_at: Timestamp.nullable(),
  created_at: Timestamp,
});
export type Notification = z.infer<typeof Notification>;

export const NotificationPrefs = z.object({
  push: z.record(NotificationType, z.boolean()),
});

export const listNotifications = defineRoute({
  id: 'listNotifications',
  method: 'get',
  path: '/notifications',
  auth: 'member',
  tag: 'notifications',
  summary: 'In-app notifications, newest first (FR-NOTIF-01)',
  query: PageQuery,
  status: 200,
  response: page(Notification),
});

export const unreadCount = defineRoute({
  id: 'unreadCount',
  method: 'get',
  path: '/notifications/unread-count',
  auth: 'member',
  tag: 'notifications',
  summary: 'Unread badge count; clients poll it (FR-NOTIF-05)',
  status: 200,
  response: z.object({ count: z.number().int() }),
});

export const markRead = defineRoute({
  id: 'markRead',
  method: 'post',
  path: '/notifications/read',
  auth: 'member',
  tag: 'notifications',
  summary: 'Mark some or all notifications read (FR-NOTIF-01)',
  body: z.union([
    z.object({ ids: z.array(Id).min(1).max(100) }),
    z.object({ all: z.literal(true) }),
  ]),
  status: 204,
  response: null,
});

export const getNotificationPrefs = defineRoute({
  id: 'getNotificationPrefs',
  method: 'get',
  path: '/notification-prefs',
  auth: 'member',
  tag: 'notifications',
  summary: 'Per-type push preferences (FR-NOTIF-04)',
  status: 200,
  response: NotificationPrefs,
});

export const putNotificationPrefs = defineRoute({
  id: 'putNotificationPrefs',
  method: 'put',
  path: '/notification-prefs',
  auth: 'member',
  tag: 'notifications',
  summary: 'Update per-type push preferences (FR-NOTIF-04)',
  body: z.object({ push: z.partialRecord(NotificationType, z.boolean()) }),
  status: 200,
  response: NotificationPrefs,
});

export const getVapidKey = defineRoute({
  id: 'getVapidKey',
  method: 'get',
  path: '/push/vapid-public-key',
  auth: 'member',
  tag: 'notifications',
  summary: 'The instance VAPID public key for Web Push subscriptions (FR-NOTIF-02)',
  status: 200,
  response: z.object({ key: z.string() }),
});

export const PUSH_KINDS = ['webpush', 'expo', 'ntfy', 'gotify'] as const;
export const PushKind = z.enum(PUSH_KINDS);

/** BR-NOT-8: ntfy and Gotify targets per member. */
export const MAX_SERVER_PUSH_TARGETS = 5;

export const PushTarget = z.object({
  id: Id,
  kind: PushKind,
  /** Where pushes go, for the member to recognise it: host and topic for ntfy/Gotify. */
  label: z.string(),
  private_previews: z.boolean(),
  created_at: Timestamp,
  last_success_at: Timestamp.nullable(),
});
export type PushTarget = z.infer<typeof PushTarget>;

export const createPushTarget = defineRoute({
  id: 'createPushTarget',
  method: 'post',
  path: '/push-targets',
  auth: 'member',
  tag: 'notifications',
  summary:
    'Register a Web Push subscription, an Expo push token, or an ntfy/Gotify target (FR-NOTIF-02/03/07)',
  body: z.object({
    kind: PushKind,
    endpoint: z.string().trim().min(1).max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }).optional(),
    /** ntfy access token (optional) or Gotify application token (required); stored encrypted. */
    token: z.string().trim().min(1).max(200).optional(),
    private_previews: z.boolean().default(false),
  }),
  status: 201,
  response: z.object({ target: PushTarget }),
  errors: ['validation_failed', 'too_many_push_targets'],
});

export const listPushTargets = defineRoute({
  id: 'listPushTargets',
  method: 'get',
  path: '/push-targets',
  auth: 'member',
  tag: 'notifications',
  summary: 'My push targets (FR-NOTIF-07); tokens and device endpoints are never returned',
  status: 200,
  response: z.object({ items: z.array(PushTarget) }),
});

export const testPushTarget = defineRoute({
  id: 'testPushTarget',
  method: 'post',
  path: '/push-targets/{id}/test',
  auth: 'member',
  tag: 'notifications',
  summary: 'Send a test push to one of my targets; 5 per 10 minutes (FR-NOTIF-07)',
  params: z.object({ id: Id }),
  body: z.object({}),
  status: 200,
  response: z.object({ result: z.enum(['ok', 'error', 'gone']) }),
  errors: ['not_found', 'rate_limited'],
});

export const deletePushTarget = defineRoute({
  id: 'deletePushTarget',
  method: 'delete',
  path: '/push-targets/{id}',
  auth: 'member',
  tag: 'notifications',
  summary: 'Remove a push subscription',
  params: z.object({ id: Id }),
  status: 204,
  response: null,
  errors: ['not_found'],
});

/**
 * FR-NOTIF-06, BR-NOT-7 (ADR-0019): what a realtime event says changed. Types and ids only; the
 * client refetches the affected data through the API.
 */
export const RealtimeEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('notification'),
    notification_type: NotificationType,
    share_id: Id.nullable(),
  }),
  z.object({ type: z.literal('notifications_read') }),
]);
export type RealtimeEvent = z.infer<typeof RealtimeEvent>;

/** BR-NOT-7: open streams per member. */
export const MAX_EVENT_STREAMS = 5;

export const events = defineRoute({
  id: 'events',
  method: 'get',
  path: '/events',
  auth: 'member',
  tag: 'notifications',
  summary:
    'Realtime invalidation events as server-sent events: `event: ready`, then `data: RealtimeEvent` lines (FR-NOTIF-06)',
  status: 200,
  response: null,
  stream: 'text/event-stream',
  errors: ['rate_limited'],
});
