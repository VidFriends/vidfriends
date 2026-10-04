import { z } from 'zod';
import { Id, Timestamp } from '../common.js';
import { defineRoute } from '../route.js';
import { PublicUser } from './accounts.js';

/** Relationship from the viewer's perspective (FRD §4). */
export const RelationshipState = z.enum([
  'none',
  'friends',
  'request_sent',
  'request_received',
  'blocked',
]);
export type RelationshipState = z.infer<typeof RelationshipState>;

export const Relationship = z.object({
  user: PublicUser,
  state: RelationshipState,
  since: Timestamp.nullable(),
});
export type Relationship = z.infer<typeof Relationship>;

const UserIdParam = z.object({ user_id: Id });
const list = z.object({ items: z.array(Relationship) });

export const searchUsers = defineRoute({
  id: 'searchUsers',
  method: 'get',
  path: '/users',
  auth: 'member',
  tag: 'friends',
  summary: 'Search members by username prefix or display-name substring (FR-FRND-01)',
  query: z.object({ q: z.string().trim().max(50) }),
  status: 200,
  response: list,
  errors: ['query_too_short'],
});

export const getAvatar = defineRoute({
  id: 'getAvatar',
  method: 'get',
  path: '/users/{user_id}/avatar',
  auth: 'member',
  tag: 'friends',
  summary: 'Redirect to a short-lived signed avatar URL (FR-ACCT-01)',
  params: UserIdParam,
  query: z.object({ v: z.string().max(40).optional() }),
  status: 302,
  response: null,
  errors: ['not_found'],
});

export const getAvatarUrl = defineRoute({
  id: 'getAvatarUrl',
  method: 'get',
  path: '/users/{user_id}/avatar-url',
  auth: 'member',
  tag: 'friends',
  summary:
    'The same short-lived signed avatar URL as JSON, for clients that authenticate with a bearer token (FR-ACCT-01, FR-MOB-01)',
  params: UserIdParam,
  status: 200,
  response: z.object({ url: z.string(), expires_at: Timestamp }),
  errors: ['not_found'],
});

export const listFriends = defineRoute({
  id: 'listFriends',
  method: 'get',
  path: '/friends',
  auth: 'member',
  tag: 'friends',
  summary: 'Accepted friends (FR-FRND-05)',
  status: 200,
  response: list,
});

export const listFriendRequests = defineRoute({
  id: 'listFriendRequests',
  method: 'get',
  path: '/friends/requests',
  auth: 'member',
  tag: 'friends',
  summary: 'Incoming or outgoing friend requests (FR-FRND-05)',
  query: z.object({ direction: z.enum(['in', 'out']).default('in') }),
  status: 200,
  response: list,
});

export const listBlocks = defineRoute({
  id: 'listBlocks',
  method: 'get',
  path: '/blocks',
  auth: 'member',
  tag: 'friends',
  summary: 'Users the viewer blocked (FR-FRND-05)',
  status: 200,
  response: list,
});

export const sendFriendRequest = defineRoute({
  id: 'sendFriendRequest',
  method: 'post',
  path: '/friends/requests',
  auth: 'member',
  tag: 'friends',
  summary: 'Request friendship; a mutual request is accepted at once (FR-FRND-02/04)',
  body: z.object({ user_id: Id }),
  status: 200,
  response: z.object({ relationship: Relationship }),
  errors: ['not_found', 'cooldown', 'already_friends', 'rate_limited'],
});

export const acceptFriendRequest = defineRoute({
  id: 'acceptFriendRequest',
  method: 'post',
  path: '/friends/requests/{user_id}/accept',
  auth: 'member',
  tag: 'friends',
  summary: 'Accept an incoming request (FR-FRND-02)',
  params: UserIdParam,
  status: 200,
  response: z.object({ relationship: Relationship }),
  errors: ['not_found'],
});

export const declineFriendRequest = defineRoute({
  id: 'declineFriendRequest',
  method: 'post',
  path: '/friends/requests/{user_id}/decline',
  auth: 'member',
  tag: 'friends',
  summary: 'Silently decline an incoming request; 7-day cooldown (BR-FRND-4)',
  params: UserIdParam,
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const cancelFriendRequest = defineRoute({
  id: 'cancelFriendRequest',
  method: 'delete',
  path: '/friends/requests/{user_id}',
  auth: 'member',
  tag: 'friends',
  summary: 'Cancel an outgoing request (FR-FRND-02)',
  params: UserIdParam,
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const removeFriend = defineRoute({
  id: 'removeFriend',
  method: 'delete',
  path: '/friends/{user_id}',
  auth: 'member',
  tag: 'friends',
  summary: 'Remove a friend (FR-FRND-02)',
  params: UserIdParam,
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const blockUser = defineRoute({
  id: 'blockUser',
  method: 'put',
  path: '/blocks/{user_id}',
  auth: 'member',
  tag: 'friends',
  summary: 'Block a member (FR-FRND-03)',
  params: UserIdParam,
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const unblockUser = defineRoute({
  id: 'unblockUser',
  method: 'delete',
  path: '/blocks/{user_id}',
  auth: 'member',
  tag: 'friends',
  summary: 'Unblock; returns the pair to no relationship (BR-FRND-6)',
  params: UserIdParam,
  status: 204,
  response: null,
  errors: ['not_found'],
});
