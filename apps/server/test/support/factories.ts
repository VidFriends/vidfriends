import { createInvite, register, setup, type SelfUser } from '@vidfriends/contracts';
import type { TestClient } from '@vidfriends/test-utils';
import type { TestServer } from './app.js';

export const PASSWORD = 'tangerine-orbit-42';

export interface Member {
  client: TestClient;
  user: SelfUser;
}

/** Claims the instance (WF-AUTH-1) and returns the logged-in admin. */
export async function claimAdmin(server: TestServer, username = 'admin'): Promise<Member> {
  const client = server.client();
  const { user } = await client.ok(setup, {
    body: {
      setup_token: server.deps.setup.token as string,
      instance_name: 'Test Circle',
      username,
      password: PASSWORD,
      client: 'web',
    },
  });
  return { client, user };
}

let seq = 0;
export function uniqueName(prefix = 'user'): string {
  seq += 1;
  return `${prefix}${seq}${Math.floor(Math.random() * 1000)}`;
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
  const { user } = await client.ok(register, {
    body: {
      username: options.username ?? uniqueName(),
      password: PASSWORD,
      display_name: options.displayName ?? 'Test Person',
      invite_code: code,
      client: 'web',
    },
  });
  return { client, user };
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
