import type { PublicUser, SelfUser } from '@vidfriends/contracts';
import type { users } from '../../db/schema.js';

type UserRow = Pick<
  typeof users.$inferSelect,
  'id' | 'username' | 'displayName' | 'avatarKey' | 'role' | 'language' | 'createdAt'
>;

/** Avatars are served through the API so access stays authenticated (BR-SHR-6 spirit). */
export function avatarUrl(user: Pick<UserRow, 'id' | 'avatarKey'>): string | null {
  if (!user.avatarKey) return null;
  const version = user.avatarKey.split('/').pop()?.split('.')[0] ?? '0';
  return `/api/v1/users/${user.id}/avatar?v=${version}`;
}

export function toSelfUser(user: UserRow): SelfUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    avatar_url: avatarUrl(user),
    role: user.role,
    language: user.language,
    created_at: user.createdAt.toISOString(),
  };
}

export function toPublicUser(
  user: Pick<UserRow, 'id' | 'username' | 'displayName' | 'avatarKey'>,
): PublicUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    avatar_url: avatarUrl(user),
  };
}
