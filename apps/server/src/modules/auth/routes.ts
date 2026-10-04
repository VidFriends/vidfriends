import {
  addPasskey,
  addPasskeyOptions,
  adminRecoveryLink,
  createMobileCode,
  exchangeMobileCode,
  getMe,
  getRecovery,
  listPasskeys,
  logout,
  reauth,
  reauthOptions,
  recover,
  recoveryOptions,
  register,
  registerOptions,
  removePasskey,
  renamePasskey,
  setup,
  setupOptions,
  signIn,
  signInOptions,
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
  handler(setupOptions, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    return auth.startSetup(deps, {
      setupToken: body.setup_token,
      instanceName: body.instance_name,
      username: body.username,
      displayName: body.display_name ?? '',
      ip,
    });
  }),

  handler(setup, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.finishSetup(deps, {
      ceremonyId: body.ceremony_id,
      credential: body.credential,
      passkeyName: body.passkey_name,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    await setSessionCookies(c, deps, session);
    return { user: toSelfUser(user) };
  }),

  handler(registerOptions, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip, body.username);
    return auth.startRegister(deps, {
      username: body.username,
      displayName: body.display_name ?? '',
      inviteCode: body.invite_code,
    });
  }),

  handler(register, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.finishRegister(deps, {
      ceremonyId: body.ceremony_id,
      credential: body.credential,
      passkeyName: body.passkey_name,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    await setSessionCookies(c, deps, session);
    return { user: toSelfUser(user) };
  }),

  handler(signInOptions, async ({ c, deps, ip }) => {
    limitAuth(deps, c, ip);
    return auth.startSignIn(deps);
  }),

  handler(signIn, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.finishSignIn(deps, {
      ceremonyId: body.ceremony_id,
      credential: body.credential,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    await setSessionCookies(c, deps, session);
    return { user: toSelfUser(user) };
  }),

  handler(createMobileCode, async ({ deps, viewer, body }) => ({
    code: await auth.createMobileCode(deps, viewer, body.code_challenge),
  })),

  handler(exchangeMobileCode, async ({ c, deps, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.exchangeMobileCode(deps, {
      code: body.code,
      verifier: body.code_verifier,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    return { user: toSelfUser(user), token: session.token };
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

  handler(listPasskeys, async ({ deps, viewer }) => ({
    items: await auth.listPasskeys(deps, viewer),
  })),
  handler(addPasskeyOptions, async ({ deps, viewer }) => auth.startAddPasskey(deps, viewer)),
  handler(addPasskey, async ({ c, deps, viewer, body, ip }) => ({
    passkey: await auth.finishAddPasskey(deps, viewer, {
      ceremonyId: body.ceremony_id,
      credential: body.credential,
      passkeyName: body.passkey_name,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    }),
  })),
  handler(renamePasskey, async ({ deps, viewer, params, body }) => ({
    passkey: await auth.renamePasskey(deps, viewer, params.id, body.name),
  })),
  handler(removePasskey, async ({ deps, viewer, params, ip }) => {
    await auth.removePasskey(deps, viewer, params.id, ip);
  }),
  handler(reauthOptions, async ({ deps, viewer }) => auth.startReauth(deps, viewer)),
  handler(reauth, async ({ c, deps, viewer, body, ip }) => {
    limitAuth(deps, c, ip, viewer.username);
    await auth.finishReauth(deps, viewer, {
      ceremonyId: body.ceremony_id,
      credential: body.credential,
    });
  }),

  handler(adminRecoveryLink, async ({ deps, viewer, params, ip }) =>
    auth.createRecoveryLink(deps, { userId: params.id, actorId: viewer.id, ip }),
  ),
  handler(getRecovery, async ({ c, deps, params, ip }) => {
    limitAuth(deps, c, ip);
    return auth.getRecovery(deps, params.token);
  }),
  handler(recoveryOptions, async ({ c, deps, params, ip }) => {
    limitAuth(deps, c, ip);
    return auth.startRecovery(deps, params.token);
  }),
  handler(recover, async ({ c, deps, params, body, ip }) => {
    limitAuth(deps, c, ip);
    const { user, session } = await auth.finishRecovery(deps, params.token, {
      ceremonyId: body.ceremony_id,
      credential: body.credential,
      passkeyName: body.passkey_name,
      userAgent: c.req.header('user-agent') ?? '',
      ip,
    });
    await setSessionCookies(c, deps, session);
    return { user: toSelfUser(user) };
  }),
];
