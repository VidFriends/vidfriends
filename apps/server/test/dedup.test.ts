// M7-T18: BR-MED-4, ADR-0022: perceptual dedup shares the stored file only. Each video keeps its
// own row, link, title and adders; nobody is charged twice; a shared file outlives either video.
import { addVideo, getVideo, getVideoMedia, type Video } from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users, videoFingerprints, videos } from '../src/db/schema.js';
import { DAY } from '../src/infra/clock.js';
import { runRetention } from '../src/jobs/maintenance.js';
import { updateSettings } from '../src/modules/settings/service.js';
import { createTestServer, type TestServer } from './support/app.js';
import { claimAdmin, registerMember, type Member } from './support/factories.js';
import { FAKE_YTDLP, fixture } from './support/media.js';
import { hasS3 } from './support/s3.js';
import { waitFor } from './support/wait.js';

let server: TestServer;
let admin: Member;
const workDir = mkdtempSync(join(tmpdir(), 'vf-dedup-'));

beforeAll(async () => {
  process.env.FAKE_YTDLP_STATE = mkdtempSync(join(tmpdir(), 'vf-ytstate-'));
  server = await createTestServer(
    { YTDLP_PATH: FAKE_YTDLP, WORK_DIR: workDir, MEDIA_DEDUP: 'perceptual' },
    {
      net: {
        lookup: async () => [{ address: '142.250.1.1', family: 4 }],
        fetch: async () => ({ status: 404, headers: { get: () => null } }),
      },
    },
    { worker: true },
  );
  admin = await claimAdmin(server);
});
afterAll(async () => {
  await server.close();
  delete process.env.FAKE_YTDLP_MEDIA;
  rmSync(workDir, { recursive: true, force: true });
});

let n = 0;
/** Adds a link whose "download" is `file`, and waits until it is ready. */
async function addClip(member: Member, file: string): Promise<Video> {
  process.env.FAKE_YTDLP_MEDIA = fixture(file);
  const { video } = await member.client.ok(addVideo, {
    body: { url: `https://www.youtube.com/watch?v=ok&dedup=${++n}` },
  });
  return waitFor(
    async () => {
      const res = await member.client.ok(getVideo, { params: { id: video.id } });
      return res.video.state === 'ready' ? res.video : null;
    },
    60_000,
    `video ${video.id} ready`,
  );
}

const row = async (id: string) =>
  (await server.deps.db.select().from(videos).where(eq(videos.id, id)))[0]!;
const storage = async (m: Member) =>
  (await server.deps.db.select().from(users).where(eq(users.id, m.user.id)))[0]!.storageBytes;

describe.skipIf(!hasS3)('perceptual dedup (BR-MED-4, ADR-0022)', () => {
  it('reuses the earlier file for the same clip from another link, and keeps it while used', async () => {
    const ada = await registerMember(server, admin, { autoFriend: false });
    const bo = await registerMember(server, admin, { autoFriend: false });
    const first = await addClip(ada, 'h264.mp4');
    const again = await addClip(bo, 'h264-recoded.mp4');

    const a = await row(first.id);
    const b = await row(again.id);
    expect(b.mediaKey).toBe(a.mediaKey);
    expect(b.mediaReused).toBe(true);
    expect(a.mediaReused).toBe(false);
    // Separate videos: own link, own adder, own thumbnail; only Ada pays for the file.
    expect(b.sourceUrl).not.toBe(a.sourceUrl);
    expect(b.addedBy).toBe(bo.user.id);
    expect(b.thumbKey).not.toBe(a.thumbKey);
    expect(await storage(ada)).toBe(a.mediaBytes);
    expect(await storage(bo)).toBe(0);
    expect(again.media_bytes).toBe(first.media_bytes);
    const media = await bo.client.ok(getVideoMedia, { params: { id: again.id } });
    expect((await fetch(media.media_url!)).status).toBe(200);
    expect(
      await server.deps.db
        .select()
        .from(videoFingerprints)
        .where(eq(videoFingerprints.videoId, b.id)),
    ).toHaveLength(1);

    // Ada's video expires first: the file stays for Bo's, and Ada's bytes are released.
    await updateSettings(server.deps.db, { retention_days: 30 }, null);
    server.clock.advance(2 * DAY);
    await server.deps.db
      .update(videos)
      .set({ createdAt: server.clock.now() })
      .where(eq(videos.id, b.id));
    await runRetention(server.deps);
    expect((await row(a.id)).state).toBe('expired');
    expect((await row(b.id)).state).toBe('ready');
    expect(await server.deps.storage!.headObject(a.mediaKey!)).not.toBeNull();
    expect(await storage(ada)).toBe(0);
    expect(await storage(bo)).toBe(0);

    // Then Bo's expires too: now nothing plays the file and it is deleted.
    server.clock.advance(2 * DAY);
    await runRetention(server.deps);
    expect((await row(b.id)).state).toBe('expired');
    expect(await server.deps.storage!.headObject(a.mediaKey!)).toBeNull();
  }, 120_000);

  it('keeps separate files for a different clip and for a sharper copy', async () => {
    await updateSettings(server.deps.db, { retention_days: 0 }, null);
    const cy = await registerMember(server, admin, { autoFriend: false });
    const small = await addClip(cy, 'h264-small.mp4');
    // Same clip at twice the size: reusing the small file would lower its quality.
    const big = await addClip(cy, 'h264.mp4');
    const other = await addClip(cy, 'h264-upload.mp4');
    const keys = new Set(
      await Promise.all([small, big, other].map(async (v) => (await row(v.id)).mediaKey)),
    );
    expect(keys.size).toBe(3);
    // A later small copy reuses the earliest matching file that is sharp enough: the first small one.
    const smallAgain = await addClip(cy, 'h264-small.mp4');
    expect((await row(smallAgain.id)).mediaKey).toBe((await row(small.id)).mediaKey);
  }, 120_000);
});
