// M1-T9 / NFR-SEC-01: object-level authorization for every id-bearing route.
import {
  acceptFriendRequest,
  allRoutes,
  blockUser,
  cancelFriendRequest,
  createAvatarUpload,
  createInvite,
  declineFriendRequest,
  defineRoute,
  getAvatar,
  previewInvite,
  removeFriend,
  revokeInvite,
  setAvatar,
  unblockUser,
} from '@vidfriends/contracts';
import sharp from 'sharp';
import { hasS3 } from './support/s3.js';
import { setRelationship } from './support/world.js';
import { matrixCase, missingRoutes, runMatrix, type MatrixCase } from '@vidfriends/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestServer, type TestServer } from './support/app.js';
import { buildWorld, type World } from './support/world.js';

let server: TestServer;
let world: World;

beforeAll(async () => {
  server = await createTestServer();
  world = await buildWorld(server);
  if (hasS3) {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } })
      .png()
      .toBuffer();
    const owner = world.members.owner.client;
    const slot = await owner.ok(createAvatarUpload, {
      body: { bytes: png.length, content_type: 'image/png' },
    });
    await fetch(slot.put_url, {
      method: 'PUT',
      body: png,
      headers: { 'content-type': 'image/png' },
    });
    await owner.ok(setAvatar, { body: { upload_id: slot.upload_id } });
  }
});
afterAll(async () => server.close());

const OWNER_OR_ADMIN = {
  owner: 204,
  participant: 404,
  friend: 404,
  stranger: 404,
  blocked: 404,
  suspended: 401,
  admin: 204,
  anonymous: 401,
} as const;

type Expect = MatrixCase['expect'];
/** Only `who` succeeds with `ok`; every other member gets 404 (BR-GEN-3). */
function only(who: (keyof Expect)[], ok: number): Expect {
  const e: Expect = {
    owner: 404,
    participant: 404,
    friend: 404,
    stranger: 404,
    blocked: 404,
    suspended: 401,
    admin: 404,
    anonymous: 401,
  };
  for (const p of who) e[p] = ok;
  return e;
}

function cases(): MatrixCase[] {
  const owner = () => world.members.owner.user.id;
  return [
    matrixCase({
      route: getAvatar,
      // Any member who can see the owner gets a redirect; the blocked user gets 404.
      prepare: async () => ({ params: { user_id: owner() }, query: {} }),
      expect: hasS3
        ? {
            owner: 302,
            participant: 302,
            friend: 302,
            stranger: 302,
            blocked: 404,
            suspended: 401,
            admin: 302,
            anonymous: 401,
          }
        : {
            owner: 503,
            participant: 503,
            friend: 503,
            stranger: 503,
            blocked: 503,
            suspended: 401,
            admin: 503,
            anonymous: 401,
          },
    }),
    matrixCase({
      route: acceptFriendRequest,
      // The owner has asked the stranger; only the stranger can accept.
      prepare: async () => {
        await world.reset();
        await setRelationship(server, owner(), world.members.stranger.user.id, 'pending', owner());
        return { params: { user_id: owner() } };
      },
      expect: only(['stranger'], 200),
    }),
    matrixCase({
      route: declineFriendRequest,
      prepare: async () => {
        await world.reset();
        await setRelationship(server, owner(), world.members.stranger.user.id, 'pending', owner());
        return { params: { user_id: owner() } };
      },
      expect: only(['stranger'], 204),
    }),
    matrixCase({
      route: cancelFriendRequest,
      // The stranger has asked the owner; only the stranger can cancel.
      prepare: async () => {
        await world.reset();
        await setRelationship(
          server,
          owner(),
          world.members.stranger.user.id,
          'pending',
          world.members.stranger.user.id,
        );
        return { params: { user_id: owner() } };
      },
      expect: only(['stranger'], 204),
    }),
    matrixCase({
      route: removeFriend,
      prepare: async () => {
        await world.reset();
        return { params: { user_id: owner() } };
      },
      expect: only(['participant', 'friend'], 204),
    }),
    matrixCase({
      route: blockUser,
      // Anyone may block the owner (the blocked user: already blocked, no-op); never oneself.
      prepare: async () => {
        await world.reset();
        return { params: { user_id: owner() } };
      },
      expect: {
        owner: 404,
        participant: 204,
        friend: 204,
        stranger: 204,
        blocked: 204,
        suspended: 401,
        admin: 204,
        anonymous: 401,
      },
    }),
    matrixCase({
      route: unblockUser,
      // The stranger blocked the owner; only the stranger can unblock (BR-FRND-6).
      prepare: async () => {
        await world.reset();
        await setRelationship(
          server,
          owner(),
          world.members.stranger.user.id,
          'blocked',
          world.members.stranger.user.id,
        );
        return { params: { user_id: owner() } };
      },
      expect: only(['stranger'], 204),
    }),
    matrixCase({
      route: revokeInvite,
      prepare: async () => {
        const { invite } = await world.members.owner.client.ok(createInvite, {});
        return { params: { id: invite.id } };
      },
      expect: OWNER_OR_ADMIN,
    }),
    matrixCase({
      route: previewInvite,
      // Public by design: the unguessable code is the capability (ADR-0013).
      prepare: async () => {
        const { code } = await world.members.owner.client.ok(createInvite, {});
        return { params: { code } };
      },
      expect: {
        owner: 200,
        participant: 200,
        friend: 200,
        stranger: 200,
        blocked: 200,
        suspended: 200,
        admin: 200,
        anonymous: 200,
      },
    }),
  ];
}

describe('authorization matrix', () => {
  it('covers every id-bearing route', () => {
    expect(missingRoutes(cases())).toEqual([]);
  });

  it('fails for a route that is not in the matrix (meta-test)', () => {
    const unlisted = defineRoute({
      id: 'unlistedExample',
      method: 'get',
      path: '/examples/{id}',
      auth: 'member',
      tag: 'test',
      summary: 'not a real route',
      params: z.object({ id: z.string() }),
      status: 200,
      response: z.object({}),
    });
    expect(missingRoutes(cases(), [...allRoutes, unlisted])).toEqual(['unlistedExample']);
  });

  it('enforces the expected status for every persona', async () => {
    const failures = await runMatrix(cases(), world.client);
    expect(failures).toEqual([]);
  });
});
