// Push channels (ADR-0011). The dispatcher talks to this interface; Web Push now, Expo in M6.
import webpush from 'web-push';
import type { Db } from '../db.js';
import { getOrCreateSecret } from '../secrets.js';

export interface PushPayload {
  title: string;
  /** Opaque ids only (BR-NOT-3); the client fetches details after authenticating. */
  data: { notification_id: string; url: string };
  tag: string;
}

export interface PushTargetRow {
  id: string;
  kind: 'webpush' | 'expo';
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

export type PushResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  send(target: PushTargetRow, payload: PushPayload): Promise<PushResult>;
}

/** Push services browsers use. Endpoints elsewhere are refused (NFR-SEC-05: no arbitrary egress). */
export const WEB_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
  'push.apple.com',
];

export function isAllowedWebPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.port) return false;
  const host = url.hostname.toLowerCase();
  return WEB_PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** The instance VAPID key pair, generated on first use and stored encrypted (ADR-0011). */
export async function vapidKeys(db: Db, appSecret: string): Promise<VapidKeys> {
  const json = await getOrCreateSecret(db, appSecret, 'vapid', () =>
    JSON.stringify(webpush.generateVAPIDKeys()),
  );
  return JSON.parse(json) as VapidKeys;
}

export function createWebPushSender(keys: VapidKeys, subject: string): PushSender {
  return {
    async send(target, payload) {
      if (target.kind !== 'webpush' || !target.p256dh || !target.auth) return 'error';
      if (!isAllowedWebPushEndpoint(target.endpoint)) return 'gone';
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          {
            vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: 24 * 3600,
            timeout: 10_000,
          },
        );
        return 'ok';
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // BR-NOT-6: the subscription is gone.
        if (status === 404 || status === 410) return 'gone';
        return 'error';
      }
    },
  };
}
