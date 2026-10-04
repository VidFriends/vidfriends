// M4-T5/T6: FR-NOTIF-01, 02 (push-service mock), 04; BR-NOT-1..6.
import {
  acceptFriendRequest,
  createPushTarget,
  deletePushTarget,
  getNotificationPrefs,
  getShare,
  getVapidKey,
  listNotifications,
  markRead,
  putNotificationPrefs,
  sendFriendRequest,
  sendShares,
  unreadCount,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { instanceSecrets, pushTargets } from '../src/db/schema.js';
import type { PushPayload, PushSender, PushTargetRow } from '../src/infra/push/channels.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  idemKey,
  makeVideo,
  registerMember,
  type Member,
} from './support/factories.js';
import { waitFor } from './support/wait.js';
import { setRelationship } from './support/world.js';

const sent: { target: PushTargetRow; payload: PushPayload }[] = [];
const gone = new Set<string>();
const mock: PushSender = {
  async send(target, payload) {
    if (gone.has(target.endpoint)) return 'gone';
    sent.push({ target, payload });
    return 'ok';
  },
};

let server: TestServer;
let admin: Member;
beforeAll(async () => {
  server = await createTestServer(
    {},
    { pushSenders: async () => ({ webpush: mock }) },
    { worker: true },
  );
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}-${Date.now()}`;
const keys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

async function friendsPair() {
  const a = await registerMember(server, admin, { autoFriend: false, displayName: 'Sam' });
  const b = await registerMember(server, admin, { autoFriend: false, displayName: 'Jo' });
  await setRelationship(server, a.user.id, b.user.id, 'accepted');
  return { a, b };
}

describe('FR-NOTIF-01 in-app notifications', () => {
  it('records friend events, counts unread and marks read', async () => {
    const a = await registerMember(server, admin, { autoFriend: false, displayName: 'Ana' });
    const b = await registerMember(server, admin, { autoFriend: false, displayName: 'Ben' });
    await a.client.ok(sendFriendRequest, { body: { user_id: b.user.id } });
    await b.client.ok(acceptFriendRequest, { params: { user_id: a.user.id } });
    const bList = await b.client.ok(listNotifications, {});
    expect(bList.items[0]).toMatchObject({
      type: 'friend_request_received',
      actor: { id: a.user.id },
    });
    expect((await a.client.ok(listNotifications, {})).items[0]!.type).toBe(
      'friend_request_accepted',
    );
    expect((await b.client.ok(unreadCount)).count).toBe(1);
    await b.client.ok(markRead, { body: { all: true } });
    expect((await b.client.ok(unreadCount)).count).toBe(0);
  });

  it('marks a share notification read when the share is opened (BR-NOT-5)', async () => {
    const { a, b } = await friendsPair();
    const res = await a.client.ok(sendShares, {
      body: {
        video_id: await makeVideo(server, a.user.id),
        recipient_ids: [b.user.id],
        idempotency_key: idemKey(),
      },
    });
    expect((await b.client.ok(unreadCount)).count).toBe(1);
    await b.client.ok(getShare, { params: { id: res.results[0]!.share_id! } });
    expect((await b.client.ok(unreadCount)).count).toBe(0);
  });

  it('marks specific notifications read and never another user’s', async () => {
    const { a, b } = await friendsPair();
    await a.client.ok(sendShares, {
      body: {
        video_id: await makeVideo(server, a.user.id),
        recipient_ids: [b.user.id],
        idempotency_key: idemKey(),
      },
    });
    const id = (await b.client.ok(listNotifications, {})).items[0]!.id;
    await a.client.ok(markRead, { body: { ids: [id] } });
    expect((await b.client.ok(unreadCount)).count).toBe(1);
    await b.client.ok(markRead, { body: { ids: [id] } });
    expect((await b.client.ok(unreadCount)).count).toBe(0);
  });
});

describe('FR-NOTIF-04 preferences', () => {
  it('defaults to push for everything except share_watched and can be changed', async () => {
    const m = await registerMember(server, admin);
    const prefs = await m.client.ok(getNotificationPrefs);
    expect(prefs.push).toMatchObject({
      share_received: true,
      share_watched: false,
      reply_received: true,
    });
    const updated = await m.client.ok(putNotificationPrefs, {
      body: { push: { share_received: false, share_watched: true } },
    });
    expect(updated.push).toMatchObject({
      share_received: false,
      share_watched: true,
      reply_received: true,
    });
  });
});

describe('FR-NOTIF-02 Web Push dispatch (push-service mock)', () => {
  it('generates one VAPID key pair per instance, stored encrypted', async () => {
    const k1 = await admin.client.ok(getVapidKey);
    const k2 = await admin.client.ok(getVapidKey);
    expect(k1.key).toBe(k2.key);
    expect(k1.key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    const [row] = await server.deps.db
      .select()
      .from(instanceSecrets)
      .where(eq(instanceSecrets.key, 'vapid'));
    expect(row!.ciphertext.toString('utf8')).not.toContain(k1.key);
  });

  it('accepts only known push-service endpoints (NFR-SEC-05)', async () => {
    const m = await registerMember(server, admin);
    const bad = await m.client.call(createPushTarget, {
      body: { kind: 'webpush', endpoint: 'https://169.254.169.254/x', keys },
    });
    expect(bad.status).toBe(400);
    const ok = await m.client.call(createPushTarget, {
      body: { kind: 'webpush', endpoint: endpoint('ok'), keys },
    });
    expect(ok.status).toBe(201);
    expect(
      (await m.client.call(deletePushTarget, { params: { id: ok.body.target.id } })).status,
    ).toBe(204);
  });

  it('sends minimal payloads, coalesces shares from one sender, and honours prefs (BR-NOT-3/4)', async () => {
    const { a, b } = await friendsPair();
    const ep = endpoint('jo');
    await b.client.ok(createPushTarget, { body: { kind: 'webpush', endpoint: ep, keys } });
    for (let i = 0; i < 3; i++) {
      await a.client.ok(sendShares, {
        body: {
          video_id: await makeVideo(server, a.user.id),
          recipient_ids: [b.user.id],
          note: 'secret note',
          idempotency_key: idemKey(),
        },
      });
    }
    const first = await waitFor(
      async () => sent.find((s) => s.target.endpoint === ep),
      15_000,
      'first push',
    );
    // Either the first share alone, or (if the worker ran after all three) one summary push.
    expect(first.payload.title).toMatch(/^(New video from Sam|Sam sent you [23] videos)$/);
    expect(JSON.stringify(first.payload)).not.toContain('secret note');
    expect(Object.keys(first.payload.data).sort()).toEqual(['notification_id', 'url']);
    // The other two were coalesced into the next 2-minute slot (not pushed individually).
    await new Promise((r) => setTimeout(r, 2500));
    expect(sent.filter((s) => s.target.endpoint === ep)).toHaveLength(1);

    // Prefs: share_received off → no push for a new sender.
    const c = await registerMember(server, admin, { autoFriend: false, displayName: 'Cy' });
    await setRelationship(server, c.user.id, b.user.id, 'accepted');
    await b.client.ok(putNotificationPrefs, { body: { push: { share_received: false } } });
    await c.client.ok(sendShares, {
      body: {
        video_id: await makeVideo(server, c.user.id),
        recipient_ids: [b.user.id],
        idempotency_key: idemKey(),
      },
    });
    await new Promise((r) => setTimeout(r, 2500));
    expect(sent.filter((s) => s.target.endpoint === ep)).toHaveLength(1);
  });

  it('uses a generic title for private previews and deletes gone endpoints (BR-NOT-6)', async () => {
    const { a, b } = await friendsPair();
    const ep = endpoint('private');
    await b.client.ok(createPushTarget, {
      body: { kind: 'webpush', endpoint: ep, keys, private_previews: true },
    });
    await a.client.ok(sendFriendRequest, { body: { user_id: b.user.id } }).catch(() => undefined);
    await b.client.ok(sendFriendRequest, { body: { user_id: a.user.id } }).catch(() => undefined);
    const third = await registerMember(server, admin, { autoFriend: false, displayName: 'Dee' });
    await third.client.ok(sendFriendRequest, { body: { user_id: b.user.id } });
    const push = await waitFor(
      async () => sent.find((s) => s.target.endpoint === ep),
      15_000,
      'private push',
    );
    expect(push.payload.title).toBe('New activity on VidFriends');

    const goneEp = endpoint('gone');
    gone.add(goneEp);
    const t = await b.client.ok(createPushTarget, {
      body: { kind: 'webpush', endpoint: goneEp, keys },
    });
    const fourth = await registerMember(server, admin, { autoFriend: false });
    await fourth.client.ok(sendFriendRequest, { body: { user_id: b.user.id } });
    await waitFor(
      async () => {
        const rows = await server.deps.db
          .select()
          .from(pushTargets)
          .where(eq(pushTargets.id, t.target.id));
        return rows.length === 0;
      },
      15_000,
      'gone target deletion',
    );
  });

  it('produces a real encrypted Web Push request for a subscription', async () => {
    const vapid = webpush.generateVAPIDKeys();
    const details = webpush.generateRequestDetails(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys },
      JSON.stringify({ title: 't' }),
      {
        vapidDetails: {
          subject: 'https://vf.test',
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
      },
    );
    expect(details.headers['Content-Encoding']).toBe('aes128gcm');
    expect(String(details.headers.Authorization)).toMatch(/^vapid t=/);
  });
});
