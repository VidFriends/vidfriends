// M7-T7: FR-NOTIF-06, BR-NOT-7 (ADR-0019): realtime invalidation events over SSE.
import {
  adminUpdateUser,
  getShare,
  logout,
  markRead,
  MAX_EVENT_STREAMS,
  RealtimeEvent,
  sendFriendRequest,
  sendShares,
} from '@vidfriends/contracts';
import type { TestClient } from '@vidfriends/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { streamTiming } from '../src/modules/notifications/events.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  idemKey,
  makeVideo,
  registerMember,
  type Member,
} from './support/factories.js';
import { setRelationship } from './support/world.js';

let server: TestServer;
let admin: Member;
beforeAll(async () => {
  streamTiming.heartbeatMs = 200;
  server = await createTestServer();
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

interface Message {
  event: string;
  data: string;
}

/** Opens GET /events and reads SSE messages (comments skipped). */
async function openStream(client: TestClient) {
  const res = await client.raw('GET', '/api/v1/events');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ended = false;
  async function next(timeoutMs = 3000): Promise<Message | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const cut = buffer.indexOf('\n\n');
      if (cut >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const lines = block.split('\n').filter((l) => !l.startsWith(':'));
        if (!lines.length) continue;
        const field = (name: string) =>
          lines
            .filter((l) => l.startsWith(`${name}:`))
            .map((l) => l.slice(name.length + 1).trimStart())
            .join('\n');
        return { event: field('event') || 'message', data: field('data') };
      }
      if (ended) return null;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('timed out waiting for an event');
      const chunk = await Promise.race([
        reader.read(),
        new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), remaining)),
      ]);
      if (chunk === 'timeout') throw new Error('timed out waiting for an event');
      if (chunk.done) ended = true;
      else buffer += decoder.decode(chunk.value, { stream: true });
    }
  }
  async function nextEvent(): Promise<RealtimeEvent> {
    const m = await next();
    expect(m?.event).toBe('message');
    return RealtimeEvent.parse(JSON.parse(m!.data));
  }
  const ready = await next();
  expect(ready?.event).toBe('ready');
  return { next, nextEvent, close: () => reader.cancel() };
}

async function friends() {
  const a = await registerMember(server, admin, { autoFriend: false, displayName: 'Sam' });
  const b = await registerMember(server, admin, { autoFriend: false, displayName: 'Jo' });
  await setRelationship(server, a.user.id, b.user.id, 'accepted');
  return { a, b };
}

describe('GET /events (FR-NOTIF-06)', () => {
  it('requires a session', async () => {
    const res = await server.client().raw('GET', '/api/v1/events');
    expect(res.status).toBe(401);
  });

  it('tells the recipient about a new share, and both devices when it is read', async () => {
    const { a, b } = await friends();
    const bStream = await openStream(b.client);
    const aStream = await openStream(a.client);
    const sent = await a.client.ok(sendShares, {
      body: {
        video_id: await makeVideo(server, a.user.id),
        recipient_ids: [b.user.id],
        idempotency_key: idemKey(),
      },
    });
    const shareId = sent.results[0]!.share_id!;
    expect(await bStream.nextEvent()).toEqual({
      type: 'notification',
      notification_type: 'share_received',
      share_id: shareId,
    });
    // Opening the share marks its notification read (BR-NOT-5): open streams hear about it.
    await b.client.ok(getShare, { params: { id: shareId } });
    expect(await bStream.nextEvent()).toEqual({ type: 'notifications_read' });
    // Nothing was addressed to the sender; the next event on their stream is their own.
    const c = await registerMember(server, admin, { autoFriend: false });
    await c.client.ok(sendFriendRequest, { body: { user_id: a.user.id } });
    expect(await aStream.nextEvent()).toEqual({
      type: 'notification',
      notification_type: 'friend_request_received',
      share_id: null,
    });
    await bStream.close();
    await aStream.close();
  });

  it('sends notifications_read only when something was unread', async () => {
    const a = await registerMember(server, admin, { autoFriend: false });
    const b = await registerMember(server, admin, { autoFriend: false });
    const stream = await openStream(b.client);
    await b.client.ok(markRead, { body: { all: true } });
    await a.client.ok(sendFriendRequest, { body: { user_id: b.user.id } });
    // The first event is the request, not a read event for the empty markRead above.
    expect((await stream.nextEvent()).type).toBe('notification');
    await b.client.ok(markRead, { body: { all: true } });
    expect(await stream.nextEvent()).toEqual({ type: 'notifications_read' });
    await stream.close();
  });

  it(`allows at most ${MAX_EVENT_STREAMS} open streams per member`, async () => {
    const { a } = await friends();
    const streams = [];
    for (let i = 0; i < MAX_EVENT_STREAMS; i++) streams.push(await openStream(a.client));
    const res = await a.client.raw('GET', '/api/v1/events');
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
    await streams[0]!.close();
    // The closed stream's slot frees up once the server notices the disconnect.
    for (let i = 0; i < 50; i++) {
      const again = await a.client.raw('GET', '/api/v1/events');
      if (again.status === 200) {
        await again.body!.cancel();
        break;
      }
      await again.body?.cancel();
      await new Promise((r) => setTimeout(r, 50));
      if (i === 49) throw new Error('stream slot was not released');
    }
    for (const s of streams.slice(1)) await s.close();
  });

  it('ends the stream when the session is revoked', async () => {
    const { a } = await friends();
    const stream = await openStream(a.client);
    await a.client.ok(logout, { body: { all: true } });
    expect(await stream.next(3000)).toBeNull();
  });

  it('ends the stream when the account is suspended', async () => {
    const { a } = await friends();
    const stream = await openStream(a.client);
    await admin.client.ok(adminUpdateUser, {
      params: { id: a.user.id },
      body: { status: 'suspended' },
    });
    expect(await stream.next(3000)).toBeNull();
  });
});
