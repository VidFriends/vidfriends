// M7-T16: FR-FRND-06, BR-GRP-1..3: groups of friends for sending to several at once.
import {
  createFriendGroup,
  deleteFriendGroup,
  listFriendGroups,
  MAX_GROUPS,
  removeFriend,
  updateFriendGroup,
} from '@vidfriends/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

async function withFriends(n: number) {
  const me = await registerMember(server, admin, { autoFriend: false, displayName: 'Me' });
  const friends: Member[] = [];
  for (let i = 0; i < n; i++) {
    const f = await registerMember(server, admin, { autoFriend: false, displayName: `F${i}` });
    await setRelationship(server, me.user.id, f.user.id, 'accepted');
    friends.push(f);
  }
  return { me, friends };
}

describe('friend groups (FR-FRND-06)', () => {
  it('creates, lists, renames, changes and deletes groups', async () => {
    const { me, friends } = await withFriends(3);
    const { group } = await me.client.ok(createFriendGroup, {
      body: { name: 'Family', member_ids: [friends[0]!.user.id, friends[1]!.user.id] },
    });
    expect(group.members.map((m) => m.id).sort()).toEqual(
      [friends[0]!.user.id, friends[1]!.user.id].sort(),
    );
    const renamed = await me.client.ok(updateFriendGroup, {
      params: { id: group.id },
      body: { name: 'Fam', member_ids: [friends[2]!.user.id] },
    });
    expect(renamed.group).toMatchObject({ name: 'Fam', members: [{ id: friends[2]!.user.id }] });
    expect((await me.client.ok(listFriendGroups)).items.map((g) => g.name)).toEqual(['Fam']);
    await me.client.ok(deleteFriendGroup, { params: { id: group.id } });
    expect((await me.client.ok(listFriendGroups)).items).toEqual([]);
  });

  it('accepts only current friends, and lists only members who still are (BR-GRP-1/2)', async () => {
    const { me, friends } = await withFriends(2);
    const stranger = await registerMember(server, admin, { autoFriend: false });
    const bad = await me.client.call(createFriendGroup, {
      body: { name: 'Mixed', member_ids: [friends[0]!.user.id, stranger.user.id] },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.details).toMatchObject({ fields: { member_ids: 'not_a_friend' } });
    const { group } = await me.client.ok(createFriendGroup, {
      body: { name: 'Pals', member_ids: friends.map((f) => f.user.id) },
    });
    await me.client.ok(removeFriend, { params: { user_id: friends[1]!.user.id } });
    const [listed] = (await me.client.ok(listFriendGroups)).items;
    expect(listed!.id).toBe(group.id);
    expect(listed!.members.map((m) => m.id)).toEqual([friends[0]!.user.id]);
  });

  it('keeps names unique per member and limits the number of groups (BR-GRP-1)', async () => {
    const { me } = await withFriends(0);
    await me.client.ok(createFriendGroup, { body: { name: 'Work', member_ids: [] } });
    const dup = await me.client.call(createFriendGroup, { body: { name: 'work', member_ids: [] } });
    expect(dup.status).toBe(409);
    expect(dup.body.error?.code).toBe('group_name_taken');
    // Another member may use the same name.
    const { me: other } = await withFriends(0);
    await other.client.ok(createFriendGroup, { body: { name: 'Work', member_ids: [] } });
    for (let i = 1; i < MAX_GROUPS; i++)
      await me.client.ok(createFriendGroup, { body: { name: `G${i}`, member_ids: [] } });
    const over = await me.client.call(createFriendGroup, {
      body: { name: 'One more', member_ids: [] },
    });
    expect(over.status).toBe(409);
    expect(over.body.error?.code).toBe('too_many_groups');
  });

  it("never shows or changes another member's group", async () => {
    const { me } = await withFriends(0);
    const { me: other } = await withFriends(0);
    const { group } = await me.client.ok(createFriendGroup, {
      body: { name: 'Mine', member_ids: [] },
    });
    expect((await other.client.ok(listFriendGroups)).items).toEqual([]);
    const res = await other.client.call(updateFriendGroup, {
      params: { id: group.id },
      body: { name: 'Taken' },
    });
    expect(res.status).toBe(404);
  });
});
