// M4-T1/T2: FR-SHR-01..05, FR-FEED-01..04, BR-FEED-1..7, BR-SHR-1..6.
import {
  blockUser,
  getFeed,
  getHistory,
  getInbox,
  getSaved,
  getSent,
  getShare,
  getShareMedia,
  reportProgress,
  sendShares,
  unsendShare,
  updateShare,
  type FeedItem,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users, videos } from '../src/db/schema.js';
import { HOUR, MINUTE } from '../src/infra/clock.js';
import { deliverPendingShares } from '../src/modules/shares/service.js';
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
  server = await createTestServer();
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

/** A sender with `n` accepted friends. */
async function circle(n: number) {
  const sender = await registerMember(server, admin, { autoFriend: false, displayName: 'Sender' });
  const friends: Member[] = [];
  for (let i = 0; i < n; i++) {
    const f = await registerMember(server, admin, {
      autoFriend: false,
      displayName: `Friend ${i}`,
    });
    await setRelationship(server, sender.user.id, f.user.id, 'accepted');
    friends.push(f);
  }
  return { sender, friends };
}

const send = (m: Member, videoId: string, recipients: string[], note = '', key = idemKey()) =>
  m.client.call(sendShares, {
    body: { video_id: videoId, recipient_ids: recipients, note, idempotency_key: key },
  });

describe('FR-SHR-01/02 send', () => {
  it('creates one share per allowed recipient with per-recipient results', async () => {
    const { sender, friends } = await circle(2);
    const stranger = await registerMember(server, admin, { autoFriend: false });
    const video = await makeVideo(server, sender.user.id);
    const res = await send(
      sender,
      video,
      [friends[0]!.user.id, friends[1]!.user.id, stranger.user.id],
      'look!',
    );
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.results.map((r) => [r.recipient_id, r.status]));
    expect(byId).toEqual({
      [friends[0]!.user.id]: 'sent',
      [friends[1]!.user.id]: 'sent',
      [stranger.user.id]: 'not_allowed',
    });
    // Sending again (new key) reports already_sent and does not duplicate.
    const again = await send(sender, video, [friends[0]!.user.id]);
    expect(again.body.results[0]!.status).toBe('already_sent');
  });

  it('is idempotent: the same key within 24 h returns the original result', async () => {
    const { sender, friends } = await circle(1);
    const video = await makeVideo(server, sender.user.id);
    const key = idemKey();
    const first = await send(sender, video, [friends[0]!.user.id], '', key);
    const replay = await send(sender, video, [friends[0]!.user.id], '', key);
    expect(replay.body).toEqual(first.body);
    expect(replay.body.results[0]!.status).toBe('sent');
  });

  it('refuses blocked, pending and suspended recipients, and videos the sender cannot see', async () => {
    const { sender, friends } = await circle(3);
    const [blocked, pending, suspended] = friends as [Member, Member, Member];
    await setRelationship(server, sender.user.id, blocked.user.id, 'blocked', blocked.user.id);
    await setRelationship(server, sender.user.id, pending.user.id, 'pending', sender.user.id);
    await server.deps.db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, suspended.user.id));
    const video = await makeVideo(server, sender.user.id);
    const res = await send(
      sender,
      video,
      friends.map((f) => f.user.id),
    );
    expect(res.body.results.every((r) => r.status === 'not_allowed')).toBe(true);
    const otherVideo = await makeVideo(server, admin.user.id);
    expect((await send(sender, otherVideo, [blocked.user.id])).body.error?.code).toBe(
      'video_not_found',
    );
  });

  it('allows re-sharing a received video', async () => {
    const { sender, friends } = await circle(1);
    const relay = friends[0]!;
    const third = await registerMember(server, admin, { autoFriend: false });
    await setRelationship(server, relay.user.id, third.user.id, 'accepted');
    const video = await makeVideo(server, sender.user.id);
    await send(sender, video, [relay.user.id]);
    expect((await send(relay, video, [third.user.id])).body.results[0]!.status).toBe('sent');
  });
});

describe('FR-SHR-03 deferred delivery', () => {
  it('delivers shares of a processing video when it becomes playable', async () => {
    const { sender, friends } = await circle(1);
    const video = await makeVideo(server, sender.user.id, { state: 'processing' });
    const res = await send(sender, video, [friends[0]!.user.id]);
    const shareId = res.body.results[0]!.share_id!;
    expect((await friends[0]!.client.ok(getFeed, {})).items).toHaveLength(0);
    expect((await friends[0]!.client.call(getShare, { params: { id: shareId } })).status).toBe(404);
    const sent = await sender.client.ok(getSent, {});
    expect(sent.items[0]).toMatchObject({ id: shareId, status: 'processing' });

    await server.deps.db.update(videos).set({ state: 'ready' }).where(eq(videos.id, video));
    await server.deps.db.transaction((tx) => deliverPendingShares(server.deps, tx, video));
    expect((await friends[0]!.client.ok(getFeed, {})).items.map((i) => i.id)).toEqual([shareId]);
    expect((await sender.client.ok(getSent, {})).items[0]!.status).toBe('delivered');
  });
});

describe('FR-SHR-04 unsend', () => {
  it('lets the sender unsend until watched', async () => {
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const a = (await send(sender, await makeVideo(server, sender.user.id), [r.user.id])).body
      .results[0]!.share_id!;
    expect((await r.client.call(unsendShare, { params: { id: a } })).status).toBe(404); // recipient cannot
    expect((await sender.client.call(unsendShare, { params: { id: a } })).status).toBe(204);
    expect((await r.client.call(getShare, { params: { id: a } })).status).toBe(404);

    const b = (await send(sender, await makeVideo(server, sender.user.id), [r.user.id])).body
      .results[0]!.share_id!;
    await r.client.ok(reportProgress, { params: { id: b }, body: { position_ms: 11_000 } });
    const late = await sender.client.call(unsendShare, { params: { id: b } });
    expect(late.status).toBe(409);
    expect(late.body.error?.code).toBe('already_watched');
  });
});

describe('FR-FEED-03 watched threshold (BR-SHR-3)', () => {
  it('sets watched at ≥ 10 s or ≥ 50%, once, and never from scrolling', async () => {
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const long = (
      await send(sender, await makeVideo(server, sender.user.id, { durationMs: 120_000 }), [
        r.user.id,
      ])
    ).body.results[0]!.share_id!;
    expect(
      (await r.client.ok(reportProgress, { params: { id: long }, body: { position_ms: 0 } }))
        .watched_at,
    ).toBeNull();
    expect(
      (await r.client.ok(reportProgress, { params: { id: long }, body: { position_ms: 9_000 } }))
        .watched_at,
    ).toBeNull();
    const w = await r.client.ok(reportProgress, {
      params: { id: long },
      body: { position_ms: 10_000 },
    });
    expect(w.watched_at).not.toBeNull();
    server.clock.advance(MINUTE);
    const again = await r.client.ok(reportProgress, {
      params: { id: long },
      body: { position_ms: 20_000 },
    });
    expect(again.watched_at).toBe(w.watched_at); // set once

    const short = (
      await send(sender, await makeVideo(server, sender.user.id, { durationMs: 6_000 }), [
        r.user.id,
      ])
    ).body.results[0]!.share_id!;
    expect(
      (await r.client.ok(reportProgress, { params: { id: short }, body: { position_ms: 2_900 } }))
        .watched_at,
    ).toBeNull();
    expect(
      (await r.client.ok(reportProgress, { params: { id: short }, body: { position_ms: 3_000 } }))
        .watched_at,
    ).not.toBeNull();

    const linkOnly = (
      await send(sender, await makeVideo(server, sender.user.id, { state: 'link_only' }), [
        r.user.id,
      ])
    ).body.results[0]!.share_id!;
    const opened = await r.client.ok(reportProgress, {
      params: { id: linkOnly },
      body: { position_ms: 0, opened_original: true },
    });
    expect(opened.watched_at).not.toBeNull();
  });

  it('only the recipient reports progress', async () => {
    const { sender, friends } = await circle(1);
    const id = (await send(sender, await makeVideo(server, sender.user.id), [friends[0]!.user.id]))
      .body.results[0]!.share_id!;
    expect(
      (await sender.client.call(reportProgress, { params: { id }, body: { position_ms: 50_000 } }))
        .status,
    ).toBe(404);
  });
});

describe('FR-FEED-01 feed (BR-FEED-1/6/7)', () => {
  it('orders unwatched oldest first, then watched newest first, with keyset pages', async () => {
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        (await send(sender, await makeVideo(server, sender.user.id), [r.user.id])).body.results[0]!
          .share_id!,
      );
      server.clock.advance(MINUTE);
    }
    // Watch #1 then #3 (so #3 is the most recently watched).
    await r.client.ok(reportProgress, { params: { id: ids[1]! }, body: { position_ms: 30_000 } });
    server.clock.advance(MINUTE);
    await r.client.ok(reportProgress, { params: { id: ids[3]! }, body: { position_ms: 30_000 } });

    const seen: FeedItem[] = [];
    let cursor: string | undefined;
    do {
      const page = await r.client.ok(getFeed, {
        query: { limit: 2, ...(cursor ? { cursor } : {}) },
      });
      seen.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(seen.map((i) => i.id)).toEqual([ids[0], ids[2], ids[4], ids[3], ids[1]]);
    expect(seen.map((i) => i.section)).toEqual([
      'unwatched',
      'unwatched',
      'unwatched',
      'watched',
      'watched',
    ]);
  });

  it('shows one item per video with "also sent by", and watching marks all of them (BR-FEED-7)', async () => {
    const { sender: a, friends } = await circle(1);
    const r = friends[0]!;
    const b = await registerMember(server, admin, { autoFriend: false, displayName: 'Bea' });
    await setRelationship(server, b.user.id, r.user.id, 'accepted');
    const video = await makeVideo(server, a.user.id);
    await server.deps.db
      .insert((await import('../src/db/schema.js')).videoAdditions)
      .values({ videoId: video, userId: b.user.id });
    const s1 = (await send(a, video, [r.user.id])).body.results[0]!.share_id!;
    server.clock.advance(MINUTE);
    const s2 = (await send(b, video, [r.user.id])).body.results[0]!.share_id!;
    const feed = await r.client.ok(getFeed, {});
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]!.id).toBe(s1);
    expect(feed.items[0]!.also_sent_by.map((u) => u.id)).toEqual([b.user.id]);
    await r.client.ok(reportProgress, { params: { id: s1 }, body: { position_ms: 30_000 } });
    expect((await r.client.ok(getShare, { params: { id: s2 } })).share.watched_at).not.toBeNull();
  });

  it('hides shares from suspended senders until unsuspended (BR-SHR-5)', async () => {
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const id = (await send(sender, await makeVideo(server, sender.user.id), [r.user.id])).body
      .results[0]!.share_id!;
    await server.deps.db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, sender.user.id));
    expect((await r.client.ok(getFeed, {})).items).toHaveLength(0);
    expect((await r.client.call(getShare, { params: { id } })).status).toBe(404);
    await server.deps.db
      .update(users)
      .set({ status: 'active' })
      .where(eq(users.id, sender.user.id));
    expect((await r.client.ok(getFeed, {})).items).toHaveLength(1);
  });

  it('deletes shares between a pair when one blocks the other (BR-FRND-5)', async () => {
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const id = (await send(sender, await makeVideo(server, sender.user.id), [r.user.id])).body
      .results[0]!.share_id!;
    await r.client.ok(blockUser, { params: { user_id: sender.user.id } });
    expect((await r.client.ok(getFeed, {})).items).toHaveLength(0);
    expect((await sender.client.call(getShare, { params: { id } })).status).toBe(404);
    expect((await sender.client.ok(getSent, {})).items).toHaveLength(0);
  });
});

describe('FR-FEED-02/04 inbox, saved, history', () => {
  it('inbox keeps unwatched, saved and watched-in-48h; hide removes; saved and history order', async () => {
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const mk = async (title: string) =>
      (await send(sender, await makeVideo(server, sender.user.id, { title }), [r.user.id])).body
        .results[0]!.share_id!;
    const unwatched = await mk('Alpha cats');
    const oldWatched = await mk('Beta dogs');
    const savedOld = await mk('Gamma birds');
    const hidden = await mk('Delta fish');
    await r.client.ok(reportProgress, {
      params: { id: oldWatched },
      body: { position_ms: 30_000 },
    });
    await r.client.ok(reportProgress, { params: { id: savedOld }, body: { position_ms: 30_000 } });
    await r.client.ok(updateShare, { params: { id: savedOld }, body: { saved: true } });
    await r.client.ok(updateShare, { params: { id: hidden }, body: { hidden: true } });
    server.clock.advance(49 * HOUR);
    const recent = await mk('Epsilon frogs');
    await r.client.ok(reportProgress, { params: { id: recent }, body: { position_ms: 30_000 } });

    const inbox = (await r.client.ok(getInbox, {})).items.map((i) => i.id);
    expect(inbox).toEqual([recent, savedOld, unwatched]); // newest first; oldWatched aged out; hidden removed
    expect((await r.client.ok(getSaved, {})).items.map((i) => i.id)).toEqual([savedOld]);
    const history = (await r.client.ok(getHistory, {})).items.map((i) => i.id);
    expect(history).toEqual([recent, savedOld, oldWatched]);
    expect(
      (await r.client.ok(getHistory, { query: { q: 'birds' } })).items.map((i) => i.id),
    ).toEqual([savedOld]);
    expect((await r.client.ok(getHistory, { query: { sender: admin.user.id } })).items).toEqual([]);
    await r.client.ok(updateShare, { params: { id: savedOld }, body: { saved: false } });
    expect((await r.client.ok(getSaved, {})).items).toEqual([]);
  });

  it('never shows saved/hidden to the sender (BR-SHR-4)', async () => {
    const { sender, friends } = await circle(1);
    const id = (await send(sender, await makeVideo(server, sender.user.id), [friends[0]!.user.id]))
      .body.results[0]!.share_id!;
    await friends[0]!.client.ok(updateShare, { params: { id }, body: { saved: true } });
    const detail = await sender.client.ok(getShare, { params: { id } });
    expect(detail.share).toMatchObject({
      role: 'sender',
      saved: null,
      hidden: null,
      progress_ms: null,
    });
    expect(Object.keys((await sender.client.ok(getSent, {})).items[0]!)).not.toContain('saved');
    expect(
      (await sender.client.call(updateShare, { params: { id }, body: { hidden: true } })).status,
    ).toBe(404);
  });

  it('serves media URLs to participants only', async () => {
    const { sender, friends } = await circle(1);
    const id = (await send(sender, await makeVideo(server, sender.user.id), [friends[0]!.user.id]))
      .body.results[0]!.share_id!;
    const other = await registerMember(server, admin);
    expect((await other.client.call(getShareMedia, { params: { id } })).status).toBe(404);
  });
});

describe('feed query plan', () => {
  it('uses the feed index on 10k seeded shares (EXPLAIN)', async () => {
    const { sql } = await import('drizzle-orm');
    const { sender, friends } = await circle(1);
    const r = friends[0]!;
    const video = await makeVideo(server, sender.user.id);
    await server.deps.db.execute(sql`
      insert into videos (id, added_by, source_kind, state, title)
      select gen_random_uuid(), ${sender.user.id}::uuid, 'upload', 'ready', 'seed' from generate_series(1, 10000)`);
    await server.deps.db.execute(sql`
      insert into shares (id, video_id, sender_id, recipient_id, delivered_at)
      select gen_random_uuid(), v.id, ${sender.user.id}::uuid, u.id, now()
      from videos v cross join (select id from users where id <> ${sender.user.id}::uuid limit 1) u
      where v.title = 'seed' on conflict do nothing`);
    await server.deps.db.execute(sql`analyze shares`);
    const plan = await server.deps.db.execute<{ 'QUERY PLAN': string }>(sql`
      explain select s.id from shares s where s.recipient_id = ${r.user.id}::uuid and s.hidden = false
        and s.delivered_at is not null order by (s.watched_at is not null), s.delivered_at, s.id limit 21`);
    const text = plan.rows.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toMatch(/shares_feed_idx|shares_sender_recipient_video_key/);
    expect(text).not.toMatch(/Seq Scan on shares/);
    void video;
  });
});
