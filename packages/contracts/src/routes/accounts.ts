import { z } from 'zod';
import { Empty, Id, Timestamp } from '../common.js';
import { defineRoute } from '../route.js';

// BR-ACCT-1: 3–30 chars of [a-z0-9_.], starting with a letter or digit, stored lower-case.
export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.]{2,29}$/, 'username_format');
// BR-ACCT-2: 10–128 characters, no composition rules (denylist checked server-side).
export const Password = z.string().min(10, 'password_too_short').max(128, 'password_too_long');
// BR-ACCT-3: 0–50 characters, trimmed.
export const DisplayName = z.string().trim().max(50);
export const ClientKind = z.enum(['web', 'mobile']);

export const Role = z.enum(['member', 'admin']);
export const UserStatus = z.enum(['active', 'suspended']);

/** A user as seen by themselves. */
export const SelfUser = z.object({
  id: Id,
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  role: Role,
  created_at: Timestamp,
});
export type SelfUser = z.infer<typeof SelfUser>;

/** A user as seen by other members (BR-FRND-8: username, display name, avatar only). */
export const PublicUser = z.object({
  id: Id,
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
});
export type PublicUser = z.infer<typeof PublicUser>;

export const SessionResponse = z.object({
  user: SelfUser,
  /** Bearer token; only returned to `client: "mobile"`. Web clients get an httpOnly cookie. */
  token: z.string().optional(),
});

export const SignupMode = z.enum(['invite_only', 'open']);

export const InstanceInfo = z.object({
  name: z.string(),
  version: z.string(),
  api_version: z.number().int(),
  signup_mode: SignupMode,
  setup_complete: z.boolean(),
});
export type InstanceInfo = z.infer<typeof InstanceInfo>;

export const getInstance = defineRoute({
  id: 'getInstance',
  method: 'get',
  path: '/instance',
  auth: 'public',
  tag: 'instance',
  summary: 'Instance name, version and signup mode (FR-PAIR-01)',
  status: 200,
  response: InstanceInfo,
});

export const setup = defineRoute({
  id: 'setup',
  method: 'post',
  path: '/setup',
  auth: 'public',
  tag: 'instance',
  summary: 'Claim the instance with the one-time setup token (FR-AUTH-01)',
  body: z.object({
    setup_token: z.string().min(1).max(200),
    instance_name: z.string().trim().min(1).max(60),
    username: Username,
    password: Password,
    client: ClientKind.default('web'),
  }),
  status: 201,
  response: SessionResponse,
  errors: ['setup_invalid', 'not_found', 'rate_limited'],
});

export const register = defineRoute({
  id: 'register',
  method: 'post',
  path: '/auth/register',
  auth: 'public',
  tag: 'auth',
  summary: 'Register with an invite (FR-AUTH-02/03)',
  body: z.object({
    username: Username,
    password: Password,
    display_name: DisplayName.optional(),
    invite_code: z.string().max(200).optional(),
    client: ClientKind.default('web'),
  }),
  status: 201,
  response: SessionResponse,
  errors: ['invite_invalid', 'username_taken', 'rate_limited'],
});

export const login = defineRoute({
  id: 'login',
  method: 'post',
  path: '/auth/login',
  auth: 'public',
  tag: 'auth',
  summary: 'Log in (FR-AUTH-04)',
  body: z.object({
    username: z.string().trim().toLowerCase().min(1).max(30),
    password: z.string().min(1).max(128),
    client: ClientKind.default('web'),
  }),
  status: 200,
  response: SessionResponse,
  errors: ['invalid_credentials', 'account_suspended', 'rate_limited'],
});

export const logout = defineRoute({
  id: 'logout',
  method: 'post',
  path: '/auth/logout',
  auth: 'member',
  tag: 'auth',
  summary: 'Log out this session, or every session with `all` (FR-AUTH-04)',
  body: z.object({ all: z.boolean().default(false) }),
  status: 204,
  response: null,
});

export const getMe = defineRoute({
  id: 'getMe',
  method: 'get',
  path: '/me',
  auth: 'member',
  tag: 'me',
  summary: 'The current user',
  status: 200,
  response: z.object({
    user: SelfUser,
    settings_summary: z.object({
      can_invite: z.boolean(),
    }),
  }),
});

export const changePassword = defineRoute({
  id: 'changePassword',
  method: 'post',
  path: '/me/password',
  auth: 'member',
  tag: 'me',
  summary: 'Change password; revokes other sessions (FR-ACCT-02)',
  body: z.object({ current_password: z.string().min(1).max(128), new_password: Password }),
  status: 204,
  response: null,
  errors: ['invalid_credentials', 'rate_limited'],
});

export { Empty };
