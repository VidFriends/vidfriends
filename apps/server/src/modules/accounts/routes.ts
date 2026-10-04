import {
  createAvatarUpload,
  deleteAvatar,
  getAvatar,
  setAvatar,
  updateMe,
} from '@vidfriends/contracts';
import { handler, Redirect } from '../../http/register.js';
import { toSelfUser } from './serialize.js';
import * as profile from './service.js';

export const accountHandlers = [
  handler(updateMe, async ({ deps, viewer, body }) => ({
    user: toSelfUser(await profile.updateDisplayName(deps, viewer, body.display_name)),
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
];
