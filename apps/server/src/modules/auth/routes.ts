import {
  changePassword as changePasswordRoute,
  getMe,
  login,
  logout,
  register,
  setup,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { handler } from '../../http/register.js';
import { ApiError } from '../../http/errors.js';
import { audit } from '../audit/service.js';
import { toSelfUser } from '../accounts/serialize.js';
import { getSettings } from '../settings/service.js';
import * as auth from './service.js';
import { limitAuth } from './limits.js';
import {
  clearSessionCookies,
  revokeAllSessions,
  revokeSession,
  setSessionCookies,
} from './sessions.js';

export const authHandlers = [
  handler(setup, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.claimInstance(deps, {
      setupToken: body.setup_token,
      instanceName: body.instance_name,
      username: body.username,
      password: body.password,
      client: body.client,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    if (body.client === 'web') await setSessionCookies(c, deps, session);
    return {
      user: toSelfUser(user),
      ...(body.client === 'mobile' ? { token: session.token } : {}),
    };
  }),

  handler(register, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.register(deps, {
      username: body.username,
      password: body.password,
      displayName: body.display_name ?? '',
      inviteCode: body.invite_code,
      client: body.client,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    if (body.client === 'web') await setSessionCookies(c, deps, session);
    return {
      user: toSelfUser(user),
      ...(body.client === 'mobile' ? { token: session.token } : {}),
    };
  }),

  handler(login, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip, body.username);
    const { user, session } = await auth.login(deps, {
      username: body.username,
      password: body.password,
      client: body.client,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    if (body.client === 'web') await setSessionCookies(c, deps, session);
    return {
      user: toSelfUser(user),
      ...(body.client === 'mobile' ? { token: session.token } : {}),
    };
  }),

  handler(logout, async ({ c, deps, body, viewer, ip }) => {
    let revoked = 1;
    if (body.all) revoked = await revokeAllSessions(deps.db, viewer.id);
    else await revokeSession(deps.db, viewer.sessionHash);
    await audit(deps.db, {
      actorId: viewer.id,
      action: body.all ? 'auth.logout_all' : 'auth.logout',
      targetType: 'user',
      targetId: viewer.id,
      metadata: { sessions_revoked: revoked },
      ip,
    });
    if (viewer.via === 'cookie') clearSessionCookies(c, deps);
  }),

  handler(getMe, async ({ deps, viewer }) => {
    const [user] = await deps.db.select().from(users).where(eq(users.id, viewer.id)).limit(1);
    if (!user) throw new ApiError('unauthorized');
    const settings = await getSettings(deps.db);
    return {
      user: toSelfUser(user),
      settings_summary: { can_invite: user.role === 'admin' || settings.members_can_invite },
    };
  }),

  handler(changePasswordRoute, async ({ c, deps, body, viewer, ip }) => {
    limitAuth(deps, c, ip, viewer.username);
    await auth.changePassword(deps, {
      userId: viewer.id,
      currentPassword: body.current_password,
      newPassword: body.new_password,
      keepSession: viewer.sessionHash,
      ip,
    });
  }),
];
