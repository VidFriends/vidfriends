// M7-T17: FR-FEED-07, BR-COL-1..3: collections of received videos.
import {
  addToCollection,
  adminUpdateUser,
  createCollection,
  deleteCollection,
  getCollection,
  getSaved,
  listCollections,
  MAX_COLLECTION_ITEMS,
  MAX_COLLECTIONS,
  removeFromCollection,
  sendShares,
  updateCollection,
  updateShare,
} from '@vidfriends/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionItems, shares } from '../src/db/schema.js';
import { newId } from '../src/infra/ids.js';
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

async function friends() {
  const me = await registerMember(server, admin, { autoFriend: false, displayName: 'Me' });
  const sam = await registerMember(server, admin, { autoFriend: false, displayName: 'Sam' });
  await setRelationship(server, me.user.id, sam.user.id, 'accepted');
  return { me, sam };
}

/** `from` sends `to` a new video; returns the share id. */
async function send(from: Member, to: Member, title: string) {
  const res = await from.client.ok(sendShares, {
    body: {
      video_id: await makeVideo(server, from.user.id, { title }),
      recipient_ids: [to.user.id],
      idempotency_key: idemKey(),
    },
  });
  return res.results[0]!.share_id!;
}

describe('collections (FR-FEED-07)', () => {
  it('creates, fills, pages, renames and deletes a collection; adding saves (BR-COL-2)', async () => {
    const { me, sam } = await friends();
    const one = await send(sam, me, 'One');
    const two = await send(sam, me, 'Two');
    const { collection } = await me.client.ok(createCollection, {
      body: { name: 'Cooking', share_id: one },
    });
    expect(collection).toMatchObject({ name: 'Cooking', item_count: 1, contains: null });
    await me.client.ok(addToCollection, { params: { id: collection.id, share_id: two } });
    // Adding again is a no-op.
    const again = await me.client.ok(addToCollection, {
      params: { id: collection.id, share_id: two },
    });
    expect(again.collection.item_count).toBe(2);
    // Both are now saved.
    const saved = await me.client.ok(getSaved, { query: {} });
    expect(saved.items.map((s) => s.id).sort()).toEqual([one, two].sort());

    // Newest added first, one per page.
    const p1 = await me.client.ok(getCollection, {
      params: { id: collection.id },
      query: { limit: 1 },
    });
    expect(p1.items.map((s) => s.video.title)).toEqual(['Two']);
    const p2 = await me.client.ok(getCollection, {
      params: { id: collection.id },
      query: { limit: 1, cursor: p1.next_cursor! },
    });
    expect(p2.items.map((s) => s.video.title)).toEqual(['One']);
    expect(p2.next_cursor).toBeNull();

    // `share_id` tells the picker which collections hold a share.
    const other = await me.client.ok(createCollection, { body: { name: 'aaa' } });
    const picker = await me.client.ok(listCollections, { query: { share_id: one } });
    expect(picker.items.map((c) => [c.name, c.contains])).toEqual([
      ['aaa', false],
      ['Cooking', true],
    ]);

    const renamed = await me.client.ok(updateCollection, {
      params: { id: collection.id },
      body: { name: 'Recipes' },
    });
    expect(renamed.collection.name).toBe('Recipes');
    const taken = await me.client.call(updateCollection, {
      params: { id: other.collection.id },
      body: { name: 'RECIPES' },
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error?.code).toBe('collection_name_taken');

    // Removing keeps the share saved; deleting the collection too.
    await me.client.ok(removeFromCollection, { params: { id: collection.id, share_id: one } });
    await me.client.ok(deleteCollection, { params: { id: collection.id } });
    expect((await me.client.ok(getSaved, { query: {} })).items).toHaveLength(2);
    expect((await me.client.ok(listCollections, { query: {} })).items.map((c) => c.name)).toEqual([
      'aaa',
    ]);
  });

  it('takes only shares I received, and unsaving takes a share out (BR-COL-2)', async () => {
    const { me, sam } = await friends();
    const sent = await send(me, sam, 'Mine to Sam');
    const got = await send(sam, me, 'For me');
    const { collection } = await me.client.ok(createCollection, { body: { name: 'Mix' } });
    const res = await me.client.call(addToCollection, {
      params: { id: collection.id, share_id: sent },
    });
    expect(res.status).toBe(404);
    const create = await me.client.call(createCollection, {
      body: { name: 'Other', share_id: sent },
    });
    expect(create.status).toBe(404);

    await me.client.ok(addToCollection, { params: { id: collection.id, share_id: got } });
    await me.client.ok(updateShare, { params: { id: got }, body: { saved: false } });
    const after = await me.client.ok(getCollection, { params: { id: collection.id }, query: {} });
    expect(after.collection.item_count).toBe(0);
    expect(after.items).toEqual([]);
  });

  it('hides shares from a suspended sender while suspended (BR-COL-3)', async () => {
    const { me, sam } = await friends();
    const got = await send(sam, me, 'From Sam');
    const { collection } = await me.client.ok(createCollection, {
      body: { name: 'Sam', share_id: got },
    });
    await admin.client.ok(adminUpdateUser, {
      params: { id: sam.user.id },
      body: { status: 'suspended' },
    });
    const hidden = await me.client.ok(getCollection, { params: { id: collection.id }, query: {} });
    expect(hidden).toMatchObject({ items: [], collection: { item_count: 0 } });
    await admin.client.ok(adminUpdateUser, {
      params: { id: sam.user.id },
      body: { status: 'active' },
    });
    const back = await me.client.ok(getCollection, { params: { id: collection.id }, query: {} });
    expect(back.items.map((s) => s.id)).toEqual([got]);
  });

  it(`limits collections to ${MAX_COLLECTIONS} and items to ${MAX_COLLECTION_ITEMS} (BR-COL-1)`, async () => {
    const { me, sam } = await friends();
    for (let i = 0; i < MAX_COLLECTIONS; i++)
      await me.client.ok(createCollection, { body: { name: `c${i}` } });
    const over = await me.client.call(createCollection, { body: { name: 'one more' } });
    expect(over.status).toBe(409);
    expect(over.body.error?.code).toBe('too_many_collections');

    const full = (await me.client.ok(listCollections, { query: {} })).items[0]!;
    // Fill the collection directly: the limit counts rows, not visible shares.
    const shareIds: string[] = [];
    for (let i = 0; i < MAX_COLLECTION_ITEMS; i++) {
      const id = newId();
      await server.deps.db.insert(shares).values({
        id,
        videoId: await makeVideo(server, sam.user.id),
        senderId: sam.user.id,
        recipientId: me.user.id,
        deliveredAt: new Date(),
      });
      shareIds.push(id);
    }
    await server.deps.db
      .insert(collectionItems)
      .values(shareIds.map((shareId) => ({ collectionId: full.id, shareId })));
    const extra = await send(sam, me, 'extra');
    const res = await me.client.call(addToCollection, {
      params: { id: full.id, share_id: extra },
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('collection_full');
  }, 120_000);
});
