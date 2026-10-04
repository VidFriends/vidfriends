/// <reference lib="webworker" />
// Service worker (TDD §4, FR-PWA-01, FR-NOTIF-02): precache the app shell, use index.html as the
// navigation fallback (never an offline page for online deep links), and show push notifications.
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// API calls and signed media URLs always go to the network (the legacy bug served the shell for them).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/media-store\//, /^\/healthz/, /^\/readyz/],
  }),
);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

interface PushPayload {
  title: string;
  data?: { url?: string; notification_id?: string };
  tag?: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'VidFriends' };
  try {
    payload = (event.data?.json() as PushPayload) ?? payload;
  } catch {
    // keep the generic title
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      data: payload.data ?? {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  // Only same-origin paths are opened.
  const url = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          await (client as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
