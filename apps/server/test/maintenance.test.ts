// M5-T2: FR-VID-06 retention (time travel), NFR-REL-05 sweeper, housekeeping; M5-T4 metrics.
import { reportProgress, sendShares, updateShare } from '@vidfriends/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications, users, videos } from '../src/db/schema.js';
import { DAY, HOUR } from '../src/infra/clock.js';
import { registry } from '../src/infra/metrics.js';
import { runCleanup, runRetention, runSweep } from '../src/jobs/maintenance.js';
import { updateSettings } from '../src/modules/settings/service.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  idemKey,
  makeVideo,
  signInWith,
  registerMember,
  type Member,
} from './support/factories.js';
import { hasS3 } from './support/s3.js';
import { setRelationship } from './support/world.js';

let server: TestServer;
let admin: Member;
beforeAll(async () => {
  server = await createTestServer();
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

async function pair() {
  // Time travel in earlier tests can expire the admin's session; sign in again with the passkey.
  admin.client.cookies.clear();
  expect((await signInWith(admin.client)).status).toBe(200);
  const a = await registerMember(server, admin, { autoFriend: false });
  const b = await registerMember(server, admin, { autoFriend: false });
  await setRelationship(server, a.user.id, b.user.id, 'accepted');
  return { a, b };
}

async function shared(a: Member, b: Member, bytes = 1000) {
  const video = await makeVideo(server, a.user.id);
  await server.deps.db.update(videos).set({ mediaBytes: bytes }).where(eq(videos.id, video));
  await server.deps.db
    .update(users)
    .set({ storageBytes: sql`${users.storageBytes} + ${bytes}` })
    .where(eq(users.id, a.user.id));
  const res = await a.client.ok(sendShares, {
    body: { video_id: video, recipient_ids: [b.user.id], idempotency_key: idemKey() },
  });
  return { video, share: res.results[0]!.share_id! };
}

const state = async (id: string) =>
  (await server.deps.db.select().from(videos).where(eq(videos.id, id)))[0]!;

describe('retention.purge (BR-MED-5, FR-VID-06)', () => {
  it('expires media only when every share is older than retention and none is saved', async () => {
    await updateSettings(server.deps.db, { retention_days: 30 }, null);
    const { a, b } = await pair();
    const unwatchedOld = await shared(a, b);
    const watchedRecently = await shared(a, b);
    const saved = await shared(a, b);
    server.clock.advance(20 * DAY);
    await b.client.ok(reportProgress, {
      params: { id: watchedRecently.share },
      body: { position_ms: 20_000 },
    });
    await b.client.ok(updateShare, { params: { id: saved.share }, body: { saved: true } });
    server.clock.advance(15 * DAY); // 35 days after sending; watched 15 days ago

    const before = (await server.deps.db.select().from(users).where(eq(users.id, a.user.id)))[0]!
      .storageBytes;
    const res = await runRetention(server.deps);
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await state(unwatchedOld.video)).state).toBe('expired');
    expect((await state(unwatchedOld.video)).mediaKey).toBeNull();
    expect((await state(watchedRecently.video)).state).toBe('ready');
    expect((await state(saved.video)).state).toBe('ready');
    const after = (await server.deps.db.select().from(users).where(eq(users.id, a.user.id)))[0]!
      .storageBytes;
    expect(before - after).toBe(1000); // bytes released (BR-MED-6)

    server.clock.advance(20 * DAY); // watched 35 days ago now
    await runRetention(server.deps);
    expect((await state(watchedRecently.video)).state).toBe('expired');
    expect((await state(saved.video)).state).toBe('ready'); // saved pins media
  });

  it('gives unshared videos a 24 h grace period and keeps everything when retention_days = 0', async () => {
    await updateSettings(server.deps.db, { retention_days: 30 }, null);
    const { a } = await pair();
    const lonely = await makeVideo(server, a.user.id);
    await server.deps.db
      .update(videos)
      .set({ createdAt: server.clock.now() })
      .where(eq(videos.id, lonely));
    await runRetention(server.deps);
    expect((await state(lonely)).state).toBe('ready');
    server.clock.advance(DAY + HOUR);
    await updateSettings(server.deps.db, { retention_days: 0 }, null);
    await runRetention(server.deps);
    expect((await state(lonely)).state).toBe('ready');
    await updateSettings(server.deps.db, { retention_days: 30 }, null);
    await runRetention(server.deps);
    expect((await state(lonely)).state).toBe('expired');
  });

  it('purges in-app notifications after 90 days (BR-NOT-5)', async () => {
    const { a, b } = await pair();
    await shared(a, b);
    const count = async () =>
      (await server.deps.db.select().from(notifications).where(eq(notifications.userId, b.user.id)))
        .length;
    expect(await count()).toBe(1);
    server.clock.advance(91 * DAY);
    await runRetention(server.deps);
    expect(await count()).toBe(0);
  });
});

describe.skipIf(!hasS3)('storage.sweep (NFR-REL-05)', () => {
  it('finds and removes a planted orphan, keeps referenced and young objects', async () => {
    const storage = server.deps.storage!;
    server.clock.set(new Date()); // object ages come from the store's real clock
    const { a } = await pair();
    const video = await makeVideo(server, a.user.id);
    const [row] = await server.deps.db.select().from(videos).where(eq(videos.id, video));
    await storage.putObject(row!.mediaKey!, Buffer.from('real'), 'video/mp4');
    await storage.putObject(
      'media/00000000-0000-7000-8000-000000000000/main.mp4',
      Buffer.from('orphan'),
      'video/mp4',
    );
    // Objects are only orphans once they are older than the grace period.
    expect((await runSweep(server.deps)).deleted).toEqual([]);
    server.clock.advance(2 * HOUR);
    const res = await runSweep(server.deps);
    expect(res.deleted).toEqual(['media/00000000-0000-7000-8000-000000000000/main.mp4']);
    expect(await storage.headObject(row!.mediaKey!)).not.toBeNull();
  });
});

describe('session.cleanup', () => {
  it('removes expired sessions and stale send-idempotency records', async () => {
    await pair();
    server.clock.advance(400 * DAY);
    const res = await runCleanup(server.deps);
    expect(res.sessions).toBeGreaterThan(0);
    const left = await server.deps.db.execute(sql`select count(*)::int as n from send_requests`);
    expect(left.rows[0]).toEqual({ n: 0 });
  });
});

describe('metrics (NFR-OPS-03)', () => {
  it('records HTTP latency by route pattern without ids', async () => {
    await admin.client.raw('GET', '/api/v1/instance');
    const text = await registry.metrics();
    expect(text).toMatch(
      /vidfriends_http_request_duration_seconds_bucket\{[^}]*route="\/api\/v1\/instance"/,
    );
    expect(text).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});
