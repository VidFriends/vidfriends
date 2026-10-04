import {
  createPushTarget,
  deletePushTarget,
  events,
  listPushTargets,
  testPushTarget,
  getNotificationPrefs,
  getVapidKey,
  listNotifications,
  markRead,
  putNotificationPrefs,
  unreadCount,
} from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import { vapidKeys } from '../../infra/push/channels.js';
import { eventStream } from './events.js';
import * as svc from './service.js';

export const notificationHandlers = [
  handler(events, async ({ c, deps, viewer }) => eventStream(c, deps, viewer)),
  handler(listNotifications, async ({ deps, viewer, query }) =>
    svc.list(deps, viewer, query.cursor, query.limit),
  ),
  handler(unreadCount, async ({ deps, viewer }) => ({
    count: await svc.unreadCount(deps, viewer),
  })),
  handler(markRead, async ({ deps, viewer, body }) => {
    await svc.markRead(deps, viewer, 'all' in body ? 'all' : body.ids);
  }),
  handler(getNotificationPrefs, async ({ deps, viewer }) => ({
    push: await svc.pushPrefs(deps.db, viewer.id),
  })),
  handler(putNotificationPrefs, async ({ deps, viewer, body }) =>
    svc.setPushPrefs(deps, viewer, body.push),
  ),
  handler(getVapidKey, async ({ deps }) => ({
    key: (await vapidKeys(deps.db, deps.env.APP_SECRET)).publicKey,
  })),
  handler(createPushTarget, async ({ deps, viewer, body }) =>
    svc.addPushTarget(deps, viewer, body),
  ),
  handler(listPushTargets, async ({ deps, viewer }) => svc.listPushTargets(deps, viewer)),
  handler(testPushTarget, async ({ deps, viewer, params }) =>
    svc.testPushTarget(deps, viewer, params.id),
  ),
  handler(deletePushTarget, async ({ deps, viewer, params }) => {
    await svc.deletePushTarget(deps, viewer, params.id);
  }),
];
