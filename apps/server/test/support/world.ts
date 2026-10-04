// Fixture world for the authorization matrix (SDD §3): one member per persona.
import type { Persona } from '@vidfriends/test-utils';
import type { TestClient } from '@vidfriends/test-utils';
import { and, eq, or } from 'drizzle-orm';
import { relationships, users } from '../../src/db/schema.js';
import type { TestServer } from './app.js';
import { claimAdmin, registerMember, type Member } from './factories.js';

export interface World {
  server: TestServer;
  /** Restores the canonical relationships around `owner` (cases may change them). */
  reset(): Promise<void>;
  members: Record<Exclude<Persona, 'anonymous'>, Member>;
  client(persona: Persona): TestClient;
}

export async function setRelationship(
  server: TestServer,
  a: string,
  b: string,
  state: 'accepted' | 'blocked' | 'pending' | null,
  by?: string,
): Promise<void> {
  const [low, high] = [a, b].sort() as [string, string];
  if (!state) {
    await server.deps.db
      .delete(relationships)
      .where(and(eq(relationships.userLow, low), eq(relationships.userHigh, high)));
    return;
  }
  await server.deps.db
    .insert(relationships)
    .values({
      userLow: low,
      userHigh: high,
      state,
      requestedBy: state === 'pending' ? (by ?? a) : null,
      blockedBy: state === 'blocked' ? (by ?? a) : null,
    })
    .onConflictDoUpdate({
      target: [relationships.userLow, relationships.userHigh],
      set: {
        state,
        requestedBy: state === 'pending' ? (by ?? a) : null,
        blockedBy: state === 'blocked' ? (by ?? a) : null,
      },
    });
}

export async function buildWorld(server: TestServer): Promise<World> {
  const admin = await claimAdmin(server, 'worldadmin');
  // Invites from the admin would auto-friend everyone with the admin; disable that.
  const make = (username: string) =>
    registerMember(server, admin, { username, autoFriend: false, displayName: username });
  const owner = await make('owner');
  const participant = await make('participant');
  const friend = await make('friend');
  const stranger = await make('stranger');
  const blocked = await make('blocked');
  const suspended = await make('suspended');
  const reset = async () => {
    await server.deps.db
      .delete(relationships)
      .where(
        or(eq(relationships.userLow, owner.user.id), eq(relationships.userHigh, owner.user.id)),
      );
    await setRelationship(server, owner.user.id, participant.user.id, 'accepted');
    await setRelationship(server, owner.user.id, friend.user.id, 'accepted');
    await setRelationship(server, owner.user.id, blocked.user.id, 'blocked', owner.user.id);
    await setRelationship(server, owner.user.id, suspended.user.id, 'accepted');
    await setRelationship(server, participant.user.id, suspended.user.id, 'accepted');
  };
  await reset();
  await server.deps.db
    .update(users)
    .set({ status: 'suspended' })
    .where(eq(users.id, suspended.user.id));
  const members = { owner, participant, friend, stranger, blocked, suspended, admin };
  const anonymous = server.client();
  return {
    server,
    reset,
    members,
    client: (persona) => (persona === 'anonymous' ? anonymous : members[persona].client),
  };
}
