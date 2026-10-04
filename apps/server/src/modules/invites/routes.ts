import { createInvite, listInvites, previewInvite, revokeInvite } from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import { limitAuth } from '../auth/limits.js';
import * as invites from './service.js';

export const inviteHandlers = [
  handler(createInvite, async ({ deps, viewer, body, ip }) =>
    invites.createInvite(deps, viewer, {
      maxUses: body.max_uses,
      expiresInDays: body.expires_in_days,
      autoFriend: body.auto_friend,
      ip,
    }),
  ),
  handler(listInvites, async ({ deps, viewer, query }) => invites.listInvites(deps, viewer, query)),
  handler(revokeInvite, async ({ deps, viewer, params, ip }) => {
    await invites.revokeInvite(deps, viewer, params.id, ip);
  }),
  handler(previewInvite, async ({ c, deps, params, ip }) => {
    // Rate-limited like auth endpoints to prevent code enumeration (TDD §5).
    limitAuth(deps, c, ip);
    return invites.previewInvite(deps, params.code);
  }),
];
