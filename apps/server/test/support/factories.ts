import {
  createInvite,
  reauth,
  reauthOptions,
  register,
  registerOptions,
  setup,
  setupOptions,
  signIn,
  signInOptions,
  type SelfUser,
} from '@vidfriends/contracts';
import type { TestClient } from '@vidfriends/test-utils';
import type { TestServer } from './app.js';

export interface Member {
  client: TestClient;
  user: SelfUser;
}

/** Claims the instance with a new passkey (WF-AUTH-1) and returns the signed-in admin. */
export async function claimAdmin(server: TestServer, username = 'admin'): Promise<Member> {
  const client = server.client();
  const start = await client.ok(setupOptions, {
    body: {
      setup_token: server.deps.setup.token as string,
      instance_name: 'Test Circle',
      username,
    },
  });
  const { user } = await client.ok(setup, {
    body: {
      ceremony_id: start.ceremony_id,
      credential: client.authenticator.create(start.options) as never,
    },
  });
  return { client, user };
}

let seq = 0;
export function uniqueName(prefix = 'user'): string {
  seq += 1;
  return `${prefix}${seq}${Math.floor(Math.random() * 1000)}`;
}

/** Joins with an invite code and a new passkey on `client` (WF-AUTH-2). */
export async function joinWith(
  client: TestClient,
  code: string | undefined,
  options: { username?: string; displayName?: string } = {},
): Promise<SelfUser> {
  const start = await client.ok(registerOptions, {
    body: {
      username: options.username ?? uniqueName(),
      display_name: options.displayName ?? 'Test Person',
      invite_code: code,
    },
  });
  const { user } = await client.ok(register, {
    body: {
      ceremony_id: start.ceremony_id,
      credential: client.authenticator.create(start.options) as never,
    },
  });
  return user;
}

/** Registers a member through an invite created by `inviter` (WF-AUTH-2). */
export async function registerMember(
  server: TestServer,
  inviter: Member,
  options: { username?: string; autoFriend?: boolean; displayName?: string } = {},
): Promise<Member> {
  const { code } = await inviter.client.ok(createInvite, {
    body: { max_uses: 1, expires_in_days: 7, auto_friend: options.autoFriend ?? true },
  });
  const client = server.client();
  const user = await joinWith(client, code, options);
  return { client, user };
}

/** Signs in with a passkey this client holds (WF-AUTH-3); returns the raw result. */
export async function signInWith(client: TestClient, credentialId?: string) {
  const start = await client.ok(signInOptions, { body: {} });
  return client.call(signIn, {
    body: {
      ceremony_id: start.ceremony_id,
      credential: client.authenticator.get(start.options, credentialId) as never,
    },
  });
}

/** Confirms with a passkey so sensitive actions are allowed for 5 minutes. */
export async function confirmPasskey(client: TestClient) {
  const start = await client.ok(reauthOptions, { body: {} });
  await client.ok(reauth, {
    body: {
      ceremony_id: start.ceremony_id,
      credential: client.authenticator.get(start.options) as never,
    },
  });
}

/** Inserts a video directly in the given state, added by `userId` (skips the media pipeline). */
export async function makeVideo(
  server: TestServer,
  userId: string,
  options: {
    state?: 'ready' | 'link_only' | 'processing' | 'queued';
    title?: string;
    durationMs?: number;
  } = {},
): Promise<string> {
  const { videos, videoAdditions } = await import('../../src/db/schema.js');
  const { newId } = await import('../../src/infra/ids.js');
  const id = newId();
  const state = options.state ?? 'ready';
  await server.deps.db.insert(videos).values({
    id,
    addedBy: userId,
    sourceKind: 'link',
    sourceUrl: `https://youtube.com/watch?v=${id}`,
    normalizedUrl: `https://youtube.com/watch?v=${id}`,
    platform: 'youtube',
    state,
    title: options.title ?? `Video ${id.slice(-6)}`,
    durationMs: options.durationMs ?? 60_000,
    mediaKey: state === 'ready' ? `media/${id}/main.mp4` : null,
    readyAt: state === 'ready' ? new Date() : null,
  });
  await server.deps.db.insert(videoAdditions).values({ videoId: id, userId });
  return id;
}

let keySeq = 0;
export const idemKey = () => `test-key-${Date.now()}-${++keySeq}`;
