// FR-ACCT-05 / WF-ACCT-4: data export (CAP-18).
import {
  createExport,
  deleteMe,
  downloadExport,
  getExportUrl,
  listExports,
  sendShares,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exports, videos } from '../src/db/schema.js';
import { DAY } from '../src/infra/clock.js';
import { newId } from '../src/infra/ids.js';
import { runCleanup } from '../src/jobs/maintenance.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  idemKey,
  makeVideo,
  confirmPasskey,
  registerMember,
  type Member,
} from './support/factories.js';
import { hasS3 } from './support/s3.js';
import { waitFor } from './support/wait.js';
import { setRelationship } from './support/world.js';

let server: TestServer;
let admin: Member;
beforeAll(async () => {
  server = await createTestServer({}, {}, { worker: true });
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

async function pair() {
  const a = await registerMember(server, admin, { autoFriend: false, displayName: 'Ada' });
  const b = await registerMember(server, admin, { autoFriend: false, displayName: 'Bo' });
  await setRelationship(server, a.user.id, b.user.id, 'accepted');
  return { a, b };
}

async function ready(member: Member, id: string) {
  return waitFor(
    async () => {
      const { items } = await member.client.ok(listExports);
      const item = items.find((i) => i.id === id);
      if (item?.state === 'failed') throw new Error(`export failed: ${item.error}`);
      return item?.state === 'ready' ? item : null;
    },
    20_000,
    'export ready',
  );
}

async function download(member: Member, id: string) {
  const res = await member.client.call(downloadExport, { params: { id } });
  expect(res.status).toBe(302);
  const location = res.headers.get('location')!;
  const file = await fetch(location);
  expect(file.status).toBe(200);
  expect(file.headers.get('content-disposition')).toMatch(
    /vidfriends-export-\d{4}-\d{2}-\d{2}\.zip/,
  );
  return { location, files: unzipSync(new Uint8Array(await file.arrayBuffer())) };
}

const json = (files: Record<string, Uint8Array>, name: string) =>
  JSON.parse(new TextDecoder().decode(files[`vidfriends-export/${name}`]!));

describe.skipIf(!hasS3)('FR-ACCT-05 data export', () => {
  it('builds a ZIP of my data and lets only me download it for 7 days', async () => {
    const { a, b } = await pair();
    const toB = await makeVideo(server, a.user.id, { title: 'For Bo' });
    const toA = await makeVideo(server, b.user.id, { title: 'For Ada' });
    await a.client.ok(sendShares, {
      body: {
        video_id: toB,
        recipient_ids: [b.user.id],
        note: 'watch this',
        idempotency_key: idemKey(),
      },
    });
    await b.client.ok(sendShares, {
      body: { video_id: toA, recipient_ids: [a.user.id], idempotency_key: idemKey() },
    });

    const { export: requested } = await a.client.ok(createExport, { body: {} });
    expect(requested).toMatchObject({ state: 'queued', include_media: false });
    const done = await ready(a, requested.id);
    expect(done.bytes).toBeGreaterThan(0);
    expect(new Date(done.expires_at!).getTime() - new Date(done.ready_at!).getTime()).toBe(7 * DAY);

    const { files } = await download(a, requested.id);
    const names = Object.keys(files).sort();
    expect(names).toEqual(
      [
        'README.txt',
        'friends.json',
        'profile.json',
        'received.json',
        'security.json',
        'sent.json',
        'videos.json',
      ].map((n) => `vidfriends-export/${n}`),
    );
    expect(json(files, 'profile.json')).toMatchObject({ username: a.user.username });
    expect(json(files, 'sent.json')).toEqual([expect.objectContaining({ note: 'watch this' })]);
    expect(json(files, 'received.json')).toHaveLength(1);
    expect(json(files, 'videos.json')).toEqual([
      expect.objectContaining({ id: toB, title: 'For Bo', file_in_export: false }),
    ]);
    const text = new TextDecoder().decode(files['vidfriends-export/friends.json']);
    expect(text).toContain(b.user.username);
    // No secrets in the export.
    const all = names.map((n) => new TextDecoder().decode(files[n])).join('\n');
    expect(all).not.toMatch(/public_key|credential|token/i);

    // Bearer clients get the same link as data.
    const asData = await a.client.ok(getExportUrl, { params: { id: requested.id } });
    expect((await fetch(asData.url)).status).toBe(200);

    // Nobody else can download it (BR-GEN-3).
    expect((await b.client.call(downloadExport, { params: { id: requested.id } })).status).toBe(
      404,
    );
    expect((await admin.client.call(downloadExport, { params: { id: requested.id } })).status).toBe(
      404,
    );

    // After 7 days the cleanup job expires it and deletes the file.
    const [row] = await server.deps.db.select().from(exports).where(eq(exports.id, requested.id));
    server.clock.advance(7 * DAY + 60_000);
    expect((await runCleanup(server.deps)).exports).toBeGreaterThanOrEqual(1);
    expect(await server.deps.storage!.headObject(row!.objectKey!)).toBeNull();
    const after = await a.client.ok(listExports);
    expect(after.items.find((i) => i.id === requested.id)?.state).toBe('expired');
    expect((await a.client.call(downloadExport, { params: { id: requested.id } })).status).toBe(
      404,
    );
  });

  it('includes the video files I added when asked', async () => {
    const { a } = await pair();
    const video = await makeVideo(server, a.user.id);
    const [row] = await server.deps.db.select().from(videos).where(eq(videos.id, video));
    const body = Buffer.from('not really an mp4');
    await server.deps.storage!.putObject(row!.mediaKey!, body, 'video/mp4');
    await server.deps.db
      .update(videos)
      .set({ mediaBytes: body.length })
      .where(eq(videos.id, video));

    const { export: requested } = await a.client.ok(createExport, {
      body: { include_media: true },
    });
    await ready(a, requested.id);
    const { files } = await download(a, requested.id);
    expect(Buffer.from(files[`vidfriends-export/media/${video}.mp4`]!).equals(body)).toBe(true);
    expect(json(files, 'videos.json')[0]).toMatchObject({ id: video, file_in_export: true });
  });

  it('allows one export in progress at a time', async () => {
    const { a } = await pair();
    // A row stuck in building stands for one the worker has not finished yet.
    await server.deps.db.insert(exports).values({
      id: newId(),
      userId: a.user.id,
      includeMedia: false,
      state: 'building',
      createdAt: server.clock.now(),
    });
    const res = await a.client.call(createExport, { body: {} });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('export_in_progress');
    // If the worker never finishes it, the cleanup job fails it and the member can retry.
    server.clock.advance(3 * 60 * 60 * 1000);
    await runCleanup(server.deps);
    expect((await a.client.call(createExport, { body: {} })).status).toBe(202);
  });

  it('allows at most 3 exports a day', async () => {
    const { a } = await pair();
    for (let i = 0; i < 3; i++) {
      const { export: e } = await a.client.ok(createExport, { body: {} });
      await ready(a, e.id);
    }
    const res = await a.client.call(createExport, { body: {} });
    expect(res.status).toBe(429);
    server.clock.advance(DAY + 60_000);
    expect((await a.client.call(createExport, { body: {} })).status).toBe(202);
  });

  it('deletes my exports with my account (WF-ACCT-3)', async () => {
    const { a } = await pair();
    const { export: e } = await a.client.ok(createExport, { body: {} });
    await ready(a, e.id);
    const [row] = await server.deps.db.select().from(exports).where(eq(exports.id, e.id));
    expect(await server.deps.storage!.headObject(row!.objectKey!)).not.toBeNull();
    await confirmPasskey(a.client);
    expect((await a.client.call(deleteMe, { body: {} })).status).toBe(202);
    expect(await server.deps.db.select().from(exports).where(eq(exports.id, e.id))).toEqual([]);
    await waitFor(
      async () => (await server.deps.storage!.headObject(row!.objectKey!)) === null,
      20_000,
      'export file purge',
    );
  });
});
