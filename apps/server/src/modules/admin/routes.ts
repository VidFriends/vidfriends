import {
  adminAudit,
  adminDeleteUser,
  adminGetSettings,
  adminListUsers,
  adminPasswordReset,
  adminRunRetention,
  adminStorage,
  adminUpdateSettings,
  adminUpdateUser,
  deleteMe,
  listSessions,
  revokeSessionRoute,
  usePasswordReset,
} from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import { limitAuth } from '../auth/limits.js';
import { clearSessionCookies } from '../auth/sessions.js';
import * as admin from './service.js';

export const adminHandlers = [
  handler(adminListUsers, async ({ deps, query }) => admin.listUsers(deps, query)),
  handler(adminUpdateUser, async ({ deps, viewer, params, body, ip }) => ({
    user: await admin.updateUser(deps, viewer, params.id, body, ip),
  })),
  handler(adminDeleteUser, async ({ deps, viewer, params, ip }) => {
    await admin.deleteAccount(deps, params.id, viewer.id, ip);
    return { deleted: true as const };
  }),
  handler(adminPasswordReset, async ({ deps, viewer, params, ip }) =>
    admin.createPasswordReset(deps, viewer, params.id, ip),
  ),
  handler(adminGetSettings, async ({ deps }) => admin.getAdminSettings(deps)),
  handler(adminUpdateSettings, async ({ deps, viewer, body, ip }) =>
    admin.patchSettings(deps, viewer, body, ip),
  ),
  handler(adminStorage, async ({ deps }) => admin.storageOverview(deps)),
  handler(adminRunRetention, async ({ deps, viewer, ip }) => {
    await admin.runRetentionNow(deps, viewer, ip);
    return { queued: true as const };
  }),
  handler(adminAudit, async ({ deps, query }) => admin.listAudit(deps, query)),
  handler(usePasswordReset, async ({ c, deps, params, body, ip }) => {
    limitAuth(deps, c, ip);
    await admin.usePasswordReset(deps, params.token, body.new_password, ip);
  }),
  handler(deleteMe, async ({ c, deps, viewer, body, ip }) => {
    await admin.deleteSelf(deps, viewer, body.password, ip, c);
    if (viewer.via === 'cookie') clearSessionCookies(c, deps);
    return { deleted: true as const };
  }),
  handler(listSessions, async ({ deps, viewer }) => admin.listSessions(deps, viewer)),
  handler(revokeSessionRoute, async ({ deps, viewer, params, ip }) => {
    await admin.revokeOwnSession(deps, viewer, params.id, ip);
  }),
];
