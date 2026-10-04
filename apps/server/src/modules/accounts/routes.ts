import {
  createAvatarUpload,
  deleteAvatar,
  getAvatar,
  getAvatarUrl,
  setAvatar,
  updateMe,
} from '@vidfriends/contracts';
import { handler, Redirect } from '../../http/register.js';
import { toSelfUser } from './serialize.js';
import * as profile from './service.js';

export const accountHandlers = [
  handler(updateMe, async ({ deps, viewer, body }) => ({
    user: toSelfUser(await profile.updateProfile(deps, viewer, body)),
  })),
  handler(createAvatarUpload, async ({ deps, viewer, body }) =>
    profile.createAvatarUpload(deps, viewer, body.bytes, body.content_type),
  ),
  handler(setAvatar, async ({ deps, viewer, body }) => ({
    user: toSelfUser(await profile.setAvatar(deps, viewer, body.upload_id)),
  })),
  handler(deleteAvatar, async ({ deps, viewer }) => ({
    user: toSelfUser(await profile.deleteAvatar(deps, viewer)),
  })),
  handler(getAvatar, async ({ c, deps, viewer, params }) => {
    c.header('Cache-Control', 'private, max-age=600');
    return new Redirect(await profile.avatarRedirect(deps, viewer, params.user_id));
  }),
  // Bearer clients must not follow the redirect with their Authorization header (SigV4 would
  // reject the request), so they fetch the signed URL as data instead.
  handler(getAvatarUrl, async ({ deps, viewer, params }) => ({
    url: await profile.avatarRedirect(deps, viewer, params.user_id),
    expires_at: new Date(deps.clock.now().getTime() + 15 * 60_000).toISOString(),
  })),
];
