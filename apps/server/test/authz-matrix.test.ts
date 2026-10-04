// M1-T9 / NFR-SEC-01: object-level authorization for every id-bearing route.
import {
  allRoutes,
  defineRoute,
  previewInvite,
  revokeInvite,
  createInvite,
} from '@vidfriends/contracts';
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

function cases(): MatrixCase[] {
  return [
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
