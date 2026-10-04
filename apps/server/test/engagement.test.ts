// M4-T4: FR-ENG-01..02, BR-ENG-1..5.
import {
  clearReaction,
  deleteReply,
  getSent,
  listNotifications,
  listReplies,
  postReply,
  sendShares,
  setReaction,
  unsendShare,
} from '@vidfriends/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

async function pairWithShare() {
  const s = await registerMember(server, admin, { autoFriend: false, displayName: 'Sam' });
  const r = await registerMember(server, admin, { autoFriend: false, displayName: 'Jo' });
  await setRelationship(server, s.user.id, r.user.id, 'accepted');
  const res = await s.client.ok(sendShares, {
    body: {
      video_id: await makeVideo(server, s.user.id),
      recipient_ids: [r.user.id],
      idempotency_key: idemKey(),
    },
  });
  return { s, r, id: res.results[0]!.share_id! };
}

const types = async (m: Member) =>
  (await m.client.ok(listNotifications, {})).items.map((n) => n.type);

describe('FR-ENG-01 reactions', () => {
  it('lets the recipient set, replace and clear one reaction; the sender is notified on set/change', async () => {
    const { s, r, id } = await pairWithShare();
    expect(
      (await r.client.ok(setReaction, { params: { id }, body: { emoji: '😂' } })).share.reaction,
    ).toBe('😂');
    expect(
      (await r.client.ok(setReaction, { params: { id }, body: { emoji: '🔥' } })).share.reaction,
    ).toBe('🔥');
    expect((await s.client.ok(getSent, {})).items[0]!.reaction).toBe('🔥');
    expect((await r.client.ok(clearReaction, { params: { id } })).share.reaction).toBeNull();
    expect((await types(s)).filter((t) => t === 'reaction_received')).toHaveLength(2);
    const notif = (await s.client.ok(listNotifications, {})).items.find(
      (n) => n.type === 'reaction_received',
    );
    expect(notif?.data).toEqual({ emoji: '🔥' });
  });

  it('rejects emoji outside the fixed set and reactions by the sender', async () => {
    const { s, r, id } = await pairWithShare();
    const bad = await r.client.call(setReaction, { params: { id }, body: { emoji: '💩' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('invalid_reaction');
    expect(
      (await s.client.call(setReaction, { params: { id }, body: { emoji: '👍' } })).status,
    ).toBe(404);
  });
});

describe('FR-ENG-02 replies', () => {
  it('lets both participants reply in order; delete leaves a placeholder; others cannot read', async () => {
    const { s, r, id } = await pairWithShare();
    await r.client.ok(postReply, { params: { id }, body: { body: 'haha' } });
    const mine = await s.client.ok(postReply, { params: { id }, body: { body: 'right?' } });
    await r.client.ok(postReply, { params: { id }, body: { body: 'more' } });
    expect((await s.client.call(deleteReply, { params: { id: mine.reply.id } })).status).toBe(204);
    expect((await r.client.call(deleteReply, { params: { id: mine.reply.id } })).status).toBe(404);
    const list = await r.client.ok(listReplies, { params: { id } });
    expect(list.items.map((x) => [x.body, x.deleted])).toEqual([
      ['haha', false],
      [null, true],
      ['more', false],
    ]);
    const sent = (await s.client.ok(getSent, {})).items[0]!;
    expect(sent.reply_count).toBe(2);
    expect(sent.last_reply?.body).toBe('more');
    expect(await types(s)).toContain('reply_received');
    expect(await types(r)).toContain('reply_received');

    const outsider = await registerMember(server, admin);
    expect((await outsider.client.call(listReplies, { params: { id } })).status).toBe(404);
    expect(
      (await outsider.client.call(postReply, { params: { id }, body: { body: 'hi' } })).status,
    ).toBe(404);
    expect((await admin.client.call(listReplies, { params: { id } })).status).toBe(404); // BR-ADM-1
  });

  it('validates length and rate-limits to 60 per 10 minutes (BR-ENG-3/4)', async () => {
    const { r, id } = await pairWithShare();
    expect((await r.client.call(postReply, { params: { id }, body: { body: '   ' } })).status).toBe(
      400,
    );
    expect(
      (await r.client.call(postReply, { params: { id }, body: { body: 'x'.repeat(1001) } })).status,
    ).toBe(400);
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++)
      statuses.push(
        (await r.client.call(postReply, { params: { id }, body: { body: `m${i}` } })).status,
      );
    expect(statuses.slice(0, 60).every((x) => x === 201)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it('deletes the conversation with the share (BR-ENG-5)', async () => {
    const { s, r, id } = await pairWithShare();
    await r.client.ok(postReply, { params: { id }, body: { body: 'gone soon' } });
    await s.client.ok(unsendShare, { params: { id } }).catch(() => undefined);
    // Unsend is allowed while unwatched; replies cascade.
    expect((await r.client.call(listReplies, { params: { id } })).status).toBe(404);
  });
});
