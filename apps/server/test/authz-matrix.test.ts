// M1-T9 / NFR-SEC-01: object-level authorization for every id-bearing route.
import {
  adminDeleteUser,
  adminPasswordReset,
  adminUpdateUser,
  listSessions,
  login,
  revokeSessionRoute,
  usePasswordReset,
  clearReaction,
  createPushTarget,
  deletePushTarget,
  deleteReply,
  getShare,
  getShareMedia,
  listReplies,
  postReply,
  reportProgress,
  sendShares,
  setReaction,
  unsendShare,
  updateShare,
  acceptFriendRequest,
  addVideo,
  completeUpload,
  createUpload,
  getVideo,
  getVideoMedia,
  allRoutes,
  blockUser,
  cancelFriendRequest,
  createAvatarUpload,
  createInvite,
  declineFriendRequest,
  defineRoute,
  getAvatar,
  getAvatarUrl,
  previewInvite,
  removeFriend,
  revokeInvite,
  setAvatar,
  unblockUser,
} from '@vidfriends/contracts';
import sharp from 'sharp';
import { hasS3 } from './support/s3.js';
import { setRelationship } from './support/world.js';
import { idemKey, makeVideo, registerMember } from './support/factories.js';
import { matrixCase, missingRoutes, runMatrix, type MatrixCase } from '@vidfriends/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestServer, type TestServer } from './support/app.js';
import { PASSWORD } from './support/factories.js';
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
  let linkSeq = 0;
  const ownerVideo = async () => {
    const { video } = await world.members.owner.client.ok(addVideo, {
      body: { url: `https://youtube.com/watch?v=matrix${++linkSeq}` },
    });
    return video.id;
  };
  /** A fresh share from the owner to the participant. */
  const ownerShare = async () => {
    const res = await world.members.owner.client.ok(sendShares, {
      body: {
        video_id: await makeVideo(server, owner()),
        recipient_ids: [world.members.participant.user.id],
        idempotency_key: idemKey(),
      },
    });
    return res.results[0]!.share_id!;
  };
  const both = (ok: number) => only(['owner', 'participant'], ok);
  /** Admin-only routes: members get 403 at the route guard, no session gets 401. */
  const adminOnly = (ok: number): Expect => ({
    owner: 403,
    participant: 403,
    friend: 403,
    stranger: 403,
    blocked: 403,
    suspended: 401,
    admin: ok,
    anonymous: 401,
  });
  const victim = async () =>
    (await registerMember(server, world.members.admin, { autoFriend: false })).user.id;
  return [
    matrixCase({
      route: adminUpdateUser,
      prepare: async () => ({ params: { id: await victim() }, body: { quota_bytes_override: 5 } }),
      expect: adminOnly(200),
    }),
    matrixCase({
      route: adminDeleteUser,
      prepare: async () => ({ params: { id: await victim() } }),
      expect: adminOnly(202),
    }),
    matrixCase({
      route: adminPasswordReset,
      prepare: async () => ({ params: { id: await victim() } }),
      expect: adminOnly(201),
    }),
    matrixCase({
      route: usePasswordReset,
      // Public by design: the unguessable single-use token is the capability.
      prepare: async () => {
        const { reset_url } = await world.members.admin.client.ok(adminPasswordReset, {
          params: { id: await victim() },
        });
        return {
          params: { token: reset_url.split('/').pop()! },
          body: { new_password: 'matrix-reset-2026' },
        };
      },
      expect: {
        owner: 204,
        participant: 204,
        friend: 204,
        stranger: 204,
        blocked: 204,
        suspended: 204,
        admin: 204,
        anonymous: 204,
      },
    }),
    matrixCase({
      route: revokeSessionRoute,
      // A second session of the owner: only the owner can revoke it.
      prepare: async () => {
        const extra = server.client();
        await extra.ok(login, {
          body: { username: 'owner', password: PASSWORD, client: 'mobile' },
        });
        const { items } = await world.members.owner.client.ok(listSessions);
        return { params: { id: items.find((x) => !x.current)!.id } };
      },
      expect: only(['owner'], 204),
    }),
    matrixCase({
      route: getShare,
      prepare: async () => ({ params: { id: await ownerShare() } }),
      expect: both(200),
    }),
    matrixCase({
      route: getShareMedia,
      prepare: async () => ({ params: { id: await ownerShare() } }),
      expect: both(hasS3 ? 200 : 503),
    }),
    matrixCase({
      route: unsendShare,
      prepare: async () => ({ params: { id: await ownerShare() } }),
      expect: only(['owner'], 204),
    }),
    matrixCase({
      route: reportProgress,
      prepare: async () => ({ params: { id: await ownerShare() }, body: { position_ms: 1000 } }),
      expect: only(['participant'], 200),
    }),
    matrixCase({
      route: updateShare,
      prepare: async () => ({ params: { id: await ownerShare() }, body: { saved: true } }),
      expect: only(['participant'], 200),
    }),
    matrixCase({
      route: setReaction,
      prepare: async () => ({ params: { id: await ownerShare() }, body: { emoji: '👍' } }),
      expect: only(['participant'], 200),
    }),
    matrixCase({
      route: clearReaction,
      prepare: async () => ({ params: { id: await ownerShare() } }),
      expect: only(['participant'], 200),
    }),
    matrixCase({
      route: listReplies,
      prepare: async () => ({ params: { id: await ownerShare() }, query: {} }),
      expect: both(200),
    }),
    matrixCase({
      route: postReply,
      prepare: async () => ({ params: { id: await ownerShare() }, body: { body: 'hello' } }),
      expect: both(201),
    }),
    matrixCase({
      route: deleteReply,
      // The owner's reply in a share with the participant: only its author may delete it.
      prepare: async () => {
        const id = await ownerShare();
        const { reply } = await world.members.owner.client.ok(postReply, {
          params: { id },
          body: { body: 'mine' },
        });
        return { params: { id: reply.id } };
      },
      expect: only(['owner'], 204),
    }),
    matrixCase({
      route: deletePushTarget,
      prepare: async () => {
        const { target } = await world.members.owner.client.ok(createPushTarget, {
          body: {
            kind: 'webpush',
            endpoint: `https://fcm.googleapis.com/fcm/send/matrix-${Math.random()}`,
            keys: {
              p256dh:
                'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
              auth: 'tBHItJI5svbpez7KI4CCXg',
            },
          },
        });
        return { params: { id: target.id } };
      },
      expect: only(['owner'], 204),
    }),
    matrixCase({
      route: getVideo,
      // BR-SHR-6: only members who added (or, from M4, were sent) the video can see it.
      prepare: async () => ({ params: { id: await ownerVideo() } }),
      expect: only(['owner'], 200),
    }),
    matrixCase({
      route: getVideoMedia,
      // Still queued, so the owner gets 409 not_playable; nobody else learns it exists.
      prepare: async () => ({ params: { id: await ownerVideo() } }),
      expect: only(['owner'], hasS3 ? 409 : 503),
    }),
    matrixCase({
      route: completeUpload,
      // Nothing was uploaded, so the owner gets 400 upload_incomplete; others 404.
      prepare: async () => {
        if (!hasS3) return { params: { id: '01900000-0000-7000-8000-000000000000' }, body: {} };
        const slot = await world.members.owner.client.ok(createUpload, {
          body: { bytes: 100, content_type: 'video/mp4' },
        });
        return { params: { id: slot.upload_id }, body: {} };
      },
      expect: hasS3 ? only(['owner'], 400) : only([], 404),
    }),
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
      route: getAvatarUrl,
      // Same visibility as getAvatar, as JSON for bearer clients.
      prepare: async () => ({ params: { user_id: owner() } }),
      expect: hasS3
        ? {
            owner: 200,
            participant: 200,
            friend: 200,
            stranger: 200,
            blocked: 404,
            suspended: 401,
            admin: 200,
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
