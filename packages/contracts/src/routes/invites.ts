import { z } from 'zod';
import { Id, PageQuery, Timestamp, page } from '../common.js';
import { defineRoute } from '../route.js';
import { PublicUser } from './accounts.js';

export const InviteStatus = z.enum(['active', 'expired', 'revoked', 'exhausted']);

export const Invite = z.object({
  id: Id,
  created_by: PublicUser,
  max_uses: z.number().int(),
  uses: z.number().int(),
  auto_friend: z.boolean(),
  expires_at: Timestamp,
  revoked_at: Timestamp.nullable(),
  created_at: Timestamp,
  status: InviteStatus,
});
export type Invite = z.infer<typeof Invite>;

export const createInvite = defineRoute({
  id: 'createInvite',
  method: 'post',
  path: '/invites',
  auth: 'member',
  tag: 'invites',
  summary: 'Create an invite; the code is returned once (FR-INV-01)',
  // BR-INV-1: max_uses default 1, max 50; expiry default 7 days, max 90; auto_friend default true.
  body: z.object({
    max_uses: z.number().int().min(1).max(50).default(1),
    expires_in_days: z.number().int().min(1).max(90).default(7),
    auto_friend: z.boolean().default(true),
  }),
  status: 201,
  response: z.object({ invite: Invite, code: z.string(), join_url: z.string() }),
  errors: ['forbidden'],
});

export const listInvites = defineRoute({
  id: 'listInvites',
  method: 'get',
  path: '/invites',
  auth: 'member',
  tag: 'invites',
  summary: 'List own invites (admins: all invites) (FR-INV-02)',
  query: PageQuery.extend({ scope: z.enum(['mine', 'all']).default('mine') }),
  status: 200,
  response: page(Invite),
});

export const revokeInvite = defineRoute({
  id: 'revokeInvite',
  method: 'delete',
  path: '/invites/{id}',
  auth: 'member',
  tag: 'invites',
  summary: 'Revoke an invite (creator or admin) (FR-INV-02)',
  params: z.object({ id: Id }),
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const previewInvite = defineRoute({
  id: 'previewInvite',
  method: 'get',
  path: '/invites/{code}/preview',
  auth: 'public',
  tag: 'invites',
  summary: 'Inviter display name and expiry for a join link (FR-PAIR-04)',
  params: z.object({ code: z.string().min(1).max(200) }),
  status: 200,
  response: z.object({ inviter_display_name: z.string(), expires_at: Timestamp }),
  errors: ['invite_invalid', 'rate_limited'],
});
