// M3-T3..T6: FR-VID-01..05, 07, 09 — link fetch, processing, uploads, media access.
import {
  addVideo,
  completeUpload,
  createUpload,
  getVideo,
  getVideoMedia,
  type Video,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users, videos } from '../src/db/schema.js';
import { FETCH_RETRY_DELAYS_SECONDS } from '../src/jobs/videos.js';
import { updateSettings } from '../src/modules/settings/service.js';
import { JOB_FETCH } from '../src/modules/videos/service.js';
import { createTestServer, type TestServer } from './support/app.js';
import { claimAdmin, registerMember, type Member } from './support/factories.js';
import { FAKE_YTDLP, fixture } from './support/media.js';
import { hasS3 } from './support/s3.js';
import { waitFor } from './support/wait.js';

let server: TestServer;
let admin: Member;
let member: Member;
const workDir = mkdtempSync(join(tmpdir(), 'vf-work-'));
const argLog = join(workDir, '..', `ytdlp-args-${process.pid}.log`);

beforeAll(async () => {
  process.env.FAKE_YTDLP_LOG = argLog;
  process.env.FAKE_YTDLP_MEDIA = fixture('h264.mp4');
  process.env.FAKE_YTDLP_STATE = mkdtempSync(join(tmpdir(), 'vf-ytstate-'));
  server = await createTestServer(
    {
      YTDLP_PATH: FAKE_YTDLP,
      WORK_DIR: workDir,
      FETCH_TIMEOUT_SECONDS: '10',
      FETCH_PROXY_URL: 'http://egress.invalid:3128',
    },
    {
      net: {
        lookup: async () => [{ address: '142.250.1.1', family: 4 }],
        fetch: async () => ({ status: 404, headers: { get: () => null } }),
      },
    },
    { worker: true },
  );
  admin = await claimAdmin(server);
  member = await registerMember(server, admin);
});
afterAll(async () => {
  await server.close();
  rmSync(workDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await updateSettings(
    server.deps.db,
    { link_download_enabled: true, per_user_quota_bytes: 5 * 1024 ** 3, max_duration_seconds: 600 },
    null,
  );
});

let n = 0;
const link = (mode: string) => `https://www.youtube.com/watch?v=${mode}&n=${++n}`;

async function settle(
  client: Member['client'],
  id: string,
  states = ['ready', 'link_only', 'failed'],
): Promise<Video> {
  return waitFor(
    async () => {
      const { video } = await client.ok(getVideo, { params: { id } });
      return states.includes(video.state) ? video : null;
    },
    45_000,
    `video ${id} to settle`,
  );
}

describe.skipIf(!hasS3)('video.fetch (FR-VID-02, fake yt-dlp)', () => {
  it('downloads, processes and becomes ready, then serves Range requests (FR-VID-05)', async () => {
    const res = await member.client.call(addVideo, { body: { url: link('ok') } });
    expect(res.status).toBe(201);
    expect(res.body.video.state).toBe('queued');
    const video = await settle(member.client, res.body.video.id);
    expect(video).toMatchObject({
      state: 'ready',
      title: 'Fixture ok',
      author_handle: 'fixture_author',
      platform: 'youtube',
      has_thumbnail: true,
    });
    expect(video.duration_ms).toBeGreaterThan(2500);
    expect([video.width, video.height]).toEqual([320, 240]);

    const media = await member.client.ok(getVideoMedia, { params: { id: video.id } });
    const range = await fetch(media.media_url as string, { headers: { Range: 'bytes=0-99' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toMatch(/^bytes 0-99\//);
    expect((await fetch(media.thumb_url as string)).headers.get('content-type')).toBe('image/webp');

    // Storage is attributed to the adder (BR-MED-6) exactly once.
    const [row] = await server.deps.db.select().from(videos).where(eq(videos.id, video.id));
    const [user] = await server.deps.db.select().from(users).where(eq(users.id, member.user.id));
    expect(user!.storageBytes).toBeGreaterThanOrEqual(row!.mediaBytes);
    expect(row!.mediaBytes).toBeGreaterThan(0);
  });

  it('passes the URL only after `--`, uses the egress proxy, and cleans up', async () => {
    const { video } = await member.client.ok(addVideo, { body: { url: link('ok') } });
    await settle(member.client, video.id);
    const calls = readFileSync(argLog, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as string[]);
    for (const argv of calls) {
      expect(argv.at(-2)).toBe('--');
      expect(argv.at(-1)).toMatch(/^https:\/\/youtube\.com\//);
      expect(argv[argv.indexOf('--proxy') + 1]).toBe('http://egress.invalid:3128');
    }
    expect(readdirSync(workDir)).toEqual([]);
  });

  it.each([
    ['big', 'too_large'],
    ['long', 'too_long'],
    ['unsupported', 'unsupported'],
  ])('ends a %s link as link_only (%s) with probed metadata', async (mode, reason) => {
    const { video } = await member.client.ok(addVideo, { body: { url: link(mode) } });
    const done = await settle(member.client, video.id);
    expect(done).toMatchObject({
      state: 'link_only',
      failure_reason: reason,
      title: 'Probed title',
      has_thumbnail: true,
    });
    const media = await member.client.ok(getVideoMedia, { params: { id: video.id } });
    expect(media.media_url).toBeNull();
    expect(media.thumb_url).toBeTruthy();
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('retries a failed fetch after 1 minute, then 5, then 30, then gives up as link_only (BR-MED-3)', async () => {
    expect(FETCH_RETRY_DELAYS_SECONDS).toEqual([60, 300, 1800]);
    const { video } = await member.client.ok(addVideo, { body: { url: link('fail') } });
    const retry = await waitFor(
      async () => {
        const jobs = await server.deps.queue!.boss.findJobs(JOB_FETCH, {
          data: { video_id: video.id, attempt: 2 },
        });
        return jobs[0] ?? null;
      },
      20_000,
      'retry job',
    );
    const delay = (retry.startAfter.getTime() - Date.now()) / 1000;
    expect(delay).toBeGreaterThan(40);
    expect(delay).toBeLessThan(70);
    expect((await member.client.ok(getVideo, { params: { id: video.id } })).video.state).toBe(
      'queued',
    );

    // The last attempt (4th) falls back to link_only.
    await server.deps.queue!.boss.cancel(JOB_FETCH, retry.id);
    await server.deps.queue!.send(JOB_FETCH, { video_id: video.id, attempt: 4 });
    const done = await settle(member.client, video.id);
    expect(done).toMatchObject({ state: 'link_only', failure_reason: 'fetch_failed' });
  });

  it('never downloads when link_download_enabled is false (FR-VID-09)', async () => {
    await updateSettings(server.deps.db, { link_download_enabled: false }, null);
    const { video } = await member.client.ok(addVideo, { body: { url: link('ok') } });
    const done = await settle(member.client, video.id);
    expect(done).toMatchObject({
      state: 'link_only',
      failure_reason: 'downloads_disabled',
      title: 'Probed title',
    });
    const [row] = await server.deps.db.select().from(videos).where(eq(videos.id, video.id));
    expect(row!.mediaKey).toBeNull();
    expect(row!.mediaBytes).toBe(0);
  });

  it('reuses a video for the same normalised link, visible to both adders (BR-MED-4)', async () => {
    const other = await registerMember(server, admin);
    const url = link('ok');
    const a = await member.client.call(addVideo, { body: { url } });
    const b = await other.client.call(addVideo, {
      body: { url: url.replace('www.', 'm.') + '&utm_source=share' },
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.video.id).toBe(a.body.video.id);
    expect((await other.client.call(getVideo, { params: { id: a.body.video.id } })).status).toBe(
      200,
    );
    // A third member who never added it cannot see it (BR-SHR-6).
    const stranger = await registerMember(server, admin);
    expect((await stranger.client.call(getVideo, { params: { id: a.body.video.id } })).status).toBe(
      404,
    );
    expect(
      (await stranger.client.call(getVideoMedia, { params: { id: a.body.video.id } })).status,
    ).toBe(404);
  });

  it('rejects links that are not allowlisted before any fetch (FR-VID-01)', async () => {
    const res = await member.client.call(addVideo, {
      body: { url: 'http://169.254.169.254/latest' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'url_not_allowed',
      details: { reason: 'ip_literal' },
    });
  });

  it('refuses new links when the quota is used up (FR-VID-07)', async () => {
    await updateSettings(server.deps.db, { per_user_quota_bytes: 0 }, null);
    const res = await member.client.call(addVideo, { body: { url: link('ok') } });
    expect(res.status).toBe(413);
    expect(res.body.error?.code).toBe('quota_exceeded');
  });
});

async function uploadFile(
  m: Member,
  file: string,
  contentType: 'video/mp4' | 'video/quicktime' = 'video/mp4',
) {
  const bytes = readFileSync(file);
  const slot = await m.client.ok(createUpload, {
    body: { bytes: bytes.length, content_type: contentType },
  });
  const put = await fetch(slot.put_url as string, {
    method: 'PUT',
    body: bytes,
    headers: { 'content-type': contentType },
  });
  expect(put.status).toBe(200);
  return m.client.call(completeUpload, {
    params: { id: slot.upload_id },
    body: { title: 'My clip' },
  });
}

const probeCodec = (url: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'vf-probe-'));
  return fetch(url)
    .then(async (r) => {
      const file = join(dir, 'x.mp4');
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name',
          '-of',
          'csv=p=0',
          file,
        ],
        { encoding: 'utf8' },
      ).trim();
    })
    .finally(() => rmSync(dir, { recursive: true, force: true }));
};

describe.skipIf(!hasS3)('uploads and video.process (FR-VID-03/04)', () => {
  it('remuxes H.264 MP4 and keeps it H.264', async () => {
    const m = await registerMember(server, admin);
    const res = await uploadFile(m, fixture('h264-upload.mp4'));
    expect(res.status).toBe(201);
    expect(res.body.video).toMatchObject({
      state: 'processing',
      source_kind: 'upload',
      title: 'My clip',
      source_url: null,
    });
    const video = await settle(m.client, res.body.video.id);
    expect(video.state).toBe('ready');
    const media = await m.client.ok(getVideoMedia, { params: { id: video.id } });
    expect(await probeCodec(media.media_url as string)).toBe('h264');
  });

  it('transcodes HEVC MOV to H.264', async () => {
    const m = await registerMember(server, admin);
    const res = await uploadFile(m, fixture('hevc.mov'), 'video/quicktime');
    const video = await settle(m.client, res.body.video.id);
    expect(video.state).toBe('ready');
    const media = await m.client.ok(getVideoMedia, { params: { id: video.id } });
    expect(await probeCodec(media.media_url as string)).toBe('h264');
  });

  it('marks a corrupt file as failed', async () => {
    const m = await registerMember(server, admin);
    const res = await uploadFile(m, fixture('corrupt.mp4'));
    const video = await settle(m.client, res.body.video.id);
    expect(video).toMatchObject({ state: 'failed', failure_reason: 'unplayable' });
    expect(
      (await m.client.call(getVideoMedia, { params: { id: video.id } })).body.error?.code,
    ).toBe('not_playable');
  });

  it('rejects videos over the duration limit', async () => {
    await updateSettings(server.deps.db, { max_duration_seconds: 10 }, null);
    const m = await registerMember(server, admin);
    const res = await uploadFile(m, fixture('long.mp4'));
    const video = await settle(m.client, res.body.video.id);
    expect(video).toMatchObject({ state: 'failed', failure_reason: 'too_long' });
  });

  it('sniffs content: a non-video renamed .mp4 is refused (NFR-SEC-08)', async () => {
    const m = await registerMember(server, admin);
    const file = join(workDir, '..', `fake-${process.pid}.mp4`);
    writeFileSync(file, '<html>not a video</html>'.repeat(20));
    const res = await uploadFile(m, file);
    rmSync(file);
    expect(res.status).toBe(400);
    expect(res.body.error?.details).toEqual({ fields: { upload_id: 'not_a_video' } });
  });

  it('reuses the video for an identical file (BR-MED-4)', async () => {
    const a = await registerMember(server, admin);
    const b = await registerMember(server, admin);
    const first = await uploadFile(a, fixture('hevc.mov'), 'video/quicktime');
    await settle(a.client, first.body.video.id);
    const second = await uploadFile(b, fixture('hevc.mov'), 'video/quicktime');
    expect(second.status).toBe(200);
    expect(second.body.video.id).toBe(first.body.video.id);
    expect(
      (await b.client.call(getVideoMedia, { params: { id: first.body.video.id } })).status,
    ).toBe(200);
  });

  it('checks size and quota before accepting bytes (FR-VID-03/07)', async () => {
    const m = await registerMember(server, admin);
    await updateSettings(server.deps.db, { per_user_quota_bytes: 1000 }, null);
    const quota = await m.client.call(createUpload, {
      body: { bytes: 5000, content_type: 'video/mp4' },
    });
    expect(quota.status).toBe(413);
    expect(quota.body.error?.code).toBe('quota_exceeded');
    const tooBig = await m.client.call(createUpload, {
      body: { bytes: 300 * 1024 * 1024, content_type: 'video/mp4' },
    });
    expect(tooBig.body.error?.code).toBe('too_large');
  });

  it('issues multipart part URLs above 64 MB', async () => {
    const m = await registerMember(server, admin);
    const res = await m.client.ok(createUpload, {
      body: { bytes: 100 * 1024 * 1024, content_type: 'video/mp4' },
    });
    expect(res.put_url).toBeNull();
    expect(res.multipart?.part_urls).toHaveLength(7);
    expect(res.multipart?.part_size).toBe(16 * 1024 * 1024);
  });

  it('cannot complete another member upload', async () => {
    const a = await registerMember(server, admin);
    const b = await registerMember(server, admin);
    const slot = await a.client.ok(createUpload, {
      body: { bytes: 100, content_type: 'video/mp4' },
    });
    expect(
      (await b.client.call(completeUpload, { params: { id: slot.upload_id }, body: {} })).status,
    ).toBe(404);
  });
});
