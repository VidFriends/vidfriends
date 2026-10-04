// M2-T1/T2: FR-FRND-01..05 — friends state machine, search, lists, rate limit.
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  listBlocks,
  listFriendRequests,
  listFriends,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
  type RouteDef,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.js';
import { DAY } from '../src/infra/clock.js';
import { createTestServer, type TestServer } from './support/app.js';
import { claimAdmin, registerMember, type Member } from './support/factories.js';
import { setRelationship } from './support/world.js';

let server: TestServer;
let admin: Member;

beforeAll(async () => {
  server = await createTestServer();
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

const member = (displayName = 'Member') =>
  registerMember(server, admin, { autoFriend: false, displayName });

type Start = 'none' | 'a_requested' | 'b_requested' | 'friends' | 'a_blocked' | 'b_blocked';
type Action =
  'a_request' | 'a_accept' | 'a_decline' | 'a_cancel' | 'a_remove' | 'a_block' | 'a_unblock';

async function arrange(start: Start, a: Member, b: Member) {
  const [x, y] = [a.user.id, b.user.id];
  if (start === 'a_requested') await setRelationship(server, x, y, 'pending', x);
  if (start === 'b_requested') await setRelationship(server, x, y, 'pending', y);
  if (start === 'friends') await setRelationship(server, x, y, 'accepted');
  if (start === 'a_blocked') await setRelationship(server, x, y, 'blocked', x);
  if (start === 'b_blocked') await setRelationship(server, x, y, 'blocked', y);
}

async function act(action: Action, a: Member, b: Member): Promise<number> {
  const id = b.user.id;
  const calls: Record<Action, [RouteDef, object]> = {
    a_request: [sendFriendRequest, { body: { user_id: id } }],
    a_accept: [acceptFriendRequest, { params: { user_id: id } }],
    a_decline: [declineFriendRequest, { params: { user_id: id } }],
    a_cancel: [cancelFriendRequest, { params: { user_id: id } }],
    a_remove: [removeFriend, { params: { user_id: id } }],
    a_block: [blockUser, { params: { user_id: id } }],
    a_unblock: [unblockUser, { params: { user_id: id } }],
  };
  const [route, options] = calls[action];
  return (await a.client.call(route, options)).status;
}

/** What A sees afterwards: friends list, outgoing, incoming, blocks. */
async function stateFor(a: Member, b: Member): Promise<string> {
  const id = b.user.id;
  if ((await a.client.ok(listFriends)).items.some((r) => r.user.id === id)) return 'friends';
  if (
    (await a.client.ok(listFriendRequests, { query: { direction: 'out' } })).items.some(
      (r) => r.user.id === id,
    )
  )
    return 'a_requested';
  if (
    (await a.client.ok(listFriendRequests, { query: { direction: 'in' } })).items.some(
      (r) => r.user.id === id,
    )
  )
    return 'b_requested';
  if ((await a.client.ok(listBlocks)).items.some((r) => r.user.id === id)) return 'a_blocked';
  return 'none_or_hidden';
}

// [start, action, expected status, expected state for A afterwards]
const TRANSITIONS: [Start, Action, number, string][] = [
  ['none', 'a_request', 200, 'a_requested'],
  ['a_requested', 'a_request', 200, 'a_requested'], // idempotent
  ['b_requested', 'a_request', 200, 'friends'], // BR-FRND-3 auto-accept
  ['b_requested', 'a_accept', 200, 'friends'],
  ['b_requested', 'a_decline', 204, 'none_or_hidden'],
  ['a_requested', 'a_cancel', 204, 'none_or_hidden'],
  ['friends', 'a_remove', 204, 'none_or_hidden'],
  ['none', 'a_block', 204, 'a_blocked'],
  ['a_requested', 'a_block', 204, 'a_blocked'],
  ['b_requested', 'a_block', 204, 'a_blocked'],
  ['friends', 'a_block', 204, 'a_blocked'],
  ['a_blocked', 'a_unblock', 204, 'none_or_hidden'],
  // Forbidden transitions leave the state unchanged.
  ['none', 'a_accept', 404, 'none_or_hidden'],
  ['a_requested', 'a_accept', 404, 'a_requested'], // cannot accept own request
  ['none', 'a_decline', 404, 'none_or_hidden'],
  ['a_requested', 'a_decline', 404, 'a_requested'],
  ['b_requested', 'a_cancel', 404, 'b_requested'],
  ['none', 'a_remove', 404, 'none_or_hidden'],
  ['a_requested', 'a_remove', 404, 'a_requested'],
  ['friends', 'a_request', 409, 'friends'],
  ['a_blocked', 'a_request', 404, 'a_blocked'],
  ['b_blocked', 'a_request', 404, 'none_or_hidden'], // blocked user cannot request the blocker
  ['b_blocked', 'a_unblock', 404, 'none_or_hidden'], // only the blocker unblocks (BR-FRND-6)
  ['b_blocked', 'a_block', 204, 'none_or_hidden'], // no change, nothing revealed
  ['none', 'a_unblock', 404, 'none_or_hidden'],
  ['friends', 'a_unblock', 404, 'friends'],
];

describe('FR-FRND-02/03 state machine', () => {
  it.each(TRANSITIONS)('%s --%s--> %i, then %s', async (start, action, status, after) => {
    const a = await member();
    const b = await member();
    await arrange(start, a, b);
    expect(await act(action, a, b)).toBe(status);
    expect(await stateFor(a, b)).toBe(after);
  });

  it('shows B the mirrored state', async () => {
    const a = await member();
    const b = await member();
    await a.client.ok(sendFriendRequest, { body: { user_id: b.user.id } });
    expect(await stateFor(b, a)).toBe('b_requested');
    await b.client.ok(acceptFriendRequest, { params: { user_id: a.user.id } });
    expect(await stateFor(b, a)).toBe('friends');
    expect(await stateFor(a, b)).toBe('friends');
  });

  it('rejects self-requests and unknown users with 404', async () => {
    const a = await member();
    expect((await a.client.call(sendFriendRequest, { body: { user_id: a.user.id } })).status).toBe(
      404,
    );
    expect(
      (
        await a.client.call(sendFriendRequest, {
          body: { user_id: '01900000-0000-7000-8000-000000000000' },
        })
      ).status,
    ).toBe(404);
  });

  it('hides a decline from the requester and enforces a 7-day cooldown (BR-FRND-4)', async () => {
    const a = await member();
    const b = await member();
    await a.client.ok(sendFriendRequest, { body: { user_id: b.user.id } });
    await b.client.ok(declineFriendRequest, { params: { user_id: a.user.id } });
    expect((await a.client.ok(listFriendRequests, { query: { direction: 'out' } })).items).toEqual(
      [],
    );
    const again = await a.client.call(sendFriendRequest, { body: { user_id: b.user.id } });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe('cooldown');
    // The decliner may still request the other way.
    server.clock.advance(7 * DAY + 1000);
    try {
      expect(
        (await a.client.call(sendFriendRequest, { body: { user_id: b.user.id } })).status,
      ).toBe(200);
    } finally {
      server.clock.advance(-(7 * DAY + 1000));
    }
  });

  it('does not allow requests to suspended users', async () => {
    const a = await member();
    const b = await member();
    await server.deps.db.update(users).set({ status: 'suspended' }).where(eq(users.id, b.user.id));
    expect((await a.client.call(sendFriendRequest, { body: { user_id: b.user.id } })).status).toBe(
      404,
    );
  });
});

describe('FR-FRND-04 rate limit', () => {
  it('allows 30 requests per 24 hours', async () => {
    const a = await member();
    const targets: Member[] = [];
    for (let i = 0; i < 31; i++) targets.push(await member());
    const statuses: number[] = [];
    for (const t of targets)
      statuses.push(
        (await a.client.call(sendFriendRequest, { body: { user_id: t.user.id } })).status,
      );
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('FR-FRND-01 search (BR-FRND-8)', () => {
  it('matches username prefix and display-name substring, excluding self, blockers and suspended users', async () => {
    const tag = `zq${Date.now() % 10000}`;
    const viewer = await registerMember(server, admin, {
      username: `${tag}viewer`,
      autoFriend: false,
    });
    const prefix = await registerMember(server, admin, {
      username: `${tag}alpha`,
      autoFriend: false,
    });
    const display = await registerMember(server, admin, {
      displayName: `Big ${tag.toUpperCase()} Fan`,
      autoFriend: false,
    });
    const blocker = await registerMember(server, admin, {
      username: `${tag}blocker`,
      autoFriend: false,
    });
    const blockedByViewer = await registerMember(server, admin, {
      username: `${tag}pest`,
      autoFriend: false,
    });
    const suspended = await registerMember(server, admin, {
      username: `${tag}gone`,
      autoFriend: false,
    });
    await blocker.client.ok(blockUser, { params: { user_id: viewer.user.id } });
    await viewer.client.ok(blockUser, { params: { user_id: blockedByViewer.user.id } });
    await server.deps.db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, suspended.user.id));

    const res = await viewer.client.ok(searchUsers, { query: { q: tag } });
    const ids = res.items.map((r) => r.user.id);
    expect(ids).toContain(prefix.user.id);
    expect(ids).toContain(display.user.id);
    expect(ids).not.toContain(viewer.user.id);
    expect(ids).not.toContain(blocker.user.id);
    expect(ids).not.toContain(suspended.user.id);
    expect(res.items.find((r) => r.user.id === blockedByViewer.user.id)?.state).toBe('blocked');
    // Only public fields are exposed.
    expect(Object.keys(res.items[0]!.user).sort()).toEqual([
      'avatar_url',
      'display_name',
      'id',
      'username',
    ]);
  });

  it('requires two characters, caps at 20 results and treats LIKE wildcards literally', async () => {
    const viewer = await member();
    expect((await viewer.client.call(searchUsers, { query: { q: 'a' } })).body.error?.code).toBe(
      'query_too_short',
    );
    expect(
      (await viewer.client.ok(searchUsers, { query: { q: 'us' } })).items.length,
    ).toBeLessThanOrEqual(20);
    expect((await viewer.client.ok(searchUsers, { query: { q: '%%' } })).items).toEqual([]);
  });
});

describe('FR-FRND-05 lists', () => {
  it('lists friends, incoming, outgoing and blocked users', async () => {
    const a = await member('Ann');
    const [f, i, o, x] = [await member(), await member(), await member(), await member()];
    await setRelationship(server, a.user.id, f.user.id, 'accepted');
    await i.client.ok(sendFriendRequest, { body: { user_id: a.user.id } });
    await a.client.ok(sendFriendRequest, { body: { user_id: o.user.id } });
    await a.client.ok(blockUser, { params: { user_id: x.user.id } });
    expect((await a.client.ok(listFriends)).items.map((r) => r.user.id)).toEqual([f.user.id]);
    expect(
      (await a.client.ok(listFriendRequests, { query: { direction: 'in' } })).items.map(
        (r) => r.user.id,
      ),
    ).toEqual([i.user.id]);
    expect(
      (await a.client.ok(listFriendRequests, { query: { direction: 'out' } })).items.map(
        (r) => r.user.id,
      ),
    ).toEqual([o.user.id]);
    expect((await a.client.ok(listBlocks)).items.map((r) => [r.user.id, r.state])).toEqual([
      [x.user.id, 'blocked'],
    ]);
    // The blocked user does not see the blocker anywhere.
    expect((await x.client.ok(listFriends)).items).toEqual([]);
  });
});
