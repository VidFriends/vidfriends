// M7-T10: FR-NOTIF-07, BR-NOT-8 (ADR-0020): ntfy and Gotify push targets, delivery through the
// egress guard, token secrecy, gone targets, test pushes and limits.
import {
  createPushTarget,
  deletePushTarget,
  listPushTargets,
  MAX_SERVER_PUSH_TARGETS,
  sendFriendRequest,
  testPushTarget,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pushTargets } from '../src/db/schema.js';
import { createGuardedPost } from '../src/infra/push/egress.js';
import { createTestServer, PUBLIC_URL, type TestServer } from './support/app.js';
import { claimAdmin, registerMember, type Member } from './support/factories.js';
import { waitFor } from './support/wait.js';

interface Received {
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
}

let received: Received[] = [];
let status = 200;
let fake: Server;
let base: string;
let server: TestServer;
let admin: Member;

beforeAll(async () => {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body });
      res.writeHead(status).end('{}');
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  // The fake ntfy/Gotify server is on the loopback address, so the operator lists it.
  server = await createTestServer({ PUSH_PRIVATE_HOSTS: '127.0.0.1' }, {}, { worker: true });
  admin = await claimAdmin(server);
});
afterAll(async () => {
  await server.close();
  await new Promise((r) => fake.close(r));
});
beforeEach(() => {
  received = [];
  status = 200;
});

const member = () => registerMember(server, admin, { autoFriend: false, displayName: 'Kim' });

describe('ntfy and Gotify targets (FR-NOTIF-07)', () => {
  it('delivers to ntfy with the token, a generic title and a link; never returns the token', async () => {
    const kim = await member();
    const { target } = await kim.client.ok(createPushTarget, {
      body: { kind: 'ntfy', endpoint: `${base}/kim-topic`, token: 'tk_secret_value_123' },
    });
    expect(target).toMatchObject({ kind: 'ntfy', label: `${base.slice(7)}/kim-topic` });
    expect(JSON.stringify(target)).not.toContain('tk_secret');
    const list = await kim.client.ok(listPushTargets);
    expect(JSON.stringify(list)).not.toContain('tk_secret');
    // Stored encrypted.
    const [row] = await server.deps.db
      .select()
      .from(pushTargets)
      .where(eq(pushTargets.id, target.id));
    expect(row!.secret!.toString('utf8')).not.toContain('tk_secret');

    const other = await member();
    await other.client.ok(sendFriendRequest, { body: { user_id: kim.user.id } });
    await waitFor(async () => received.length > 0);
    expect(received[0]).toMatchObject({ path: '/kim-topic', body: 'Kim wants to be friends' });
    expect(received[0]!.headers.authorization).toBe('Bearer tk_secret_value_123');
    expect(received[0]!.headers.click).toBe(`${PUBLIC_URL}/friends`);
    await waitFor(async () => {
      const [r] = await server.deps.db
        .select()
        .from(pushTargets)
        .where(eq(pushTargets.id, target.id));
      return Boolean(r?.lastSuccessAt);
    });
  });

  it('delivers to Gotify with the app token and honours private previews', async () => {
    const kim = await member();
    const bad = await kim.client.call(createPushTarget, {
      body: { kind: 'gotify', endpoint: base },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.details).toMatchObject({ fields: { token: 'required' } });
    await kim.client.ok(createPushTarget, {
      body: { kind: 'gotify', endpoint: `${base}/`, token: 'AppToken123', private_previews: true },
    });
    const other = await member();
    await other.client.ok(sendFriendRequest, { body: { user_id: kim.user.id } });
    await waitFor(async () => received.length > 0);
    expect(received[0]!.path).toBe('/message');
    expect(received[0]!.headers['x-gotify-key']).toBe('AppToken123');
    const body = JSON.parse(received[0]!.body) as {
      message: string;
      extras: Record<string, { click: { url: string } }>;
    };
    expect(body.message).toBe('New activity on VidFriends');
    expect(body.extras['client::notification']!.click.url).toBe(`${PUBLIC_URL}/friends`);
  });

  it('sends a test push, rate-limits it, and deletes a target the server refuses', async () => {
    const kim = await member();
    const { target } = await kim.client.ok(createPushTarget, {
      body: { kind: 'ntfy', endpoint: `${base}/test-topic` },
    });
    expect(await kim.client.ok(testPushTarget, { params: { id: target.id }, body: {} })).toEqual({
      result: 'ok',
    });
    expect(received[0]!.body).toBe('Test notification from VidFriends');
    for (let i = 0; i < 4; i++)
      await kim.client.ok(testPushTarget, { params: { id: target.id }, body: {} });
    const limited = await kim.client.call(testPushTarget, {
      params: { id: target.id },
      body: {},
    });
    expect(limited.status).toBe(429);

    const kim2 = await member();
    const { target: t2 } = await kim2.client.ok(createPushTarget, {
      body: { kind: 'ntfy', endpoint: `${base}/revoked` },
    });
    status = 403;
    expect(await kim2.client.ok(testPushTarget, { params: { id: t2.id }, body: {} })).toEqual({
      result: 'gone',
    });
    expect((await kim2.client.ok(listPushTargets)).items).toEqual([]);
  });

  it('keeps targets per member and limits them to five', async () => {
    const a = await member();
    const b = await member();
    const shared = `${base}/family`;
    const { target } = await a.client.ok(createPushTarget, {
      body: { kind: 'ntfy', endpoint: shared },
    });
    // Another member using the same topic gets their own target; A's stays A's.
    await b.client.ok(createPushTarget, { body: { kind: 'ntfy', endpoint: shared } });
    expect((await a.client.ok(listPushTargets)).items.map((t) => t.id)).toEqual([target.id]);
    // Re-adding the same URL updates instead of duplicating.
    await a.client.ok(createPushTarget, {
      body: { kind: 'ntfy', endpoint: shared, private_previews: true },
    });
    expect((await a.client.ok(listPushTargets)).items).toHaveLength(1);
    for (let i = 1; i < MAX_SERVER_PUSH_TARGETS; i++)
      await a.client.ok(createPushTarget, { body: { kind: 'ntfy', endpoint: `${base}/t${i}` } });
    const over = await a.client.call(createPushTarget, {
      body: { kind: 'ntfy', endpoint: `${base}/one-too-many` },
    });
    expect(over.status).toBe(409);
    expect(over.body.error?.code).toBe('too_many_push_targets');
    await a.client.ok(deletePushTarget, { params: { id: target.id } });
    expect((await b.client.ok(listPushTargets)).items).toHaveLength(1);
  });

  it('refuses private, plain-http and malformed URLs unless the operator listed the host', async () => {
    const kim = await member();
    for (const [endpoint, reason] of [
      ['http://vids.example.org/topic', 'push_endpoint_not_allowed'],
      ['https://localhost/topic', 'push_endpoint_not_allowed'],
      ['https://10.1.2.3/topic', 'push_endpoint_not_allowed'],
      ['ftp://example.org/topic', 'invalid_url'],
      ['https://user:pw@example.org/topic', 'invalid_url'],
    ] as const) {
      const res = await kim.client.call(createPushTarget, { body: { kind: 'ntfy', endpoint } });
      expect(res.status, endpoint).toBe(400);
      expect(res.body.error?.details, endpoint).toMatchObject({ fields: { endpoint: reason } });
    }
  });
});

describe('egress guard (ADR-0020)', () => {
  it('will not connect to a private address that is not listed, even if the URL passed', async () => {
    const post = createGuardedPost([]);
    await expect(
      post(`https://localhost:${new URL(base).port}/x`, { headers: {}, body: 'x' }),
    ).rejects.toThrow(/private address/);
    await expect(post(`${base}/x`, { headers: {}, body: 'x' })).rejects.toThrow(/insecure/);
    expect(received).toEqual([]);
    // Listed hosts are reachable over http.
    expect(await createGuardedPost(['127.0.0.1'])(`${base}/x`, { headers: {}, body: 'x' })).toBe(
      200,
    );
  });
});
