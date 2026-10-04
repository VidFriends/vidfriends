import { z } from 'zod';
import { Id, PageQuery, Timestamp, page } from '../common.js';
import { defineRoute } from '../route.js';
import { InstanceSettings, InstanceSettingsPatch } from '../settings.js';
import { Password, PublicUser, Role, SelfUser, UserStatus } from './accounts.js';
import { VideoState } from './videos.js';

/** An admin's view of a member: counts only, never content (BR-ADM-1). */
export const AdminUser = z.object({
  id: Id,
  username: z.string(),
  display_name: z.string(),
  role: Role,
  status: UserStatus,
  created_at: Timestamp,
  last_active_at: Timestamp.nullable(),
  storage_bytes: z.number().int(),
  quota_bytes_override: z.number().int().nullable(),
  shares_sent: z.number().int(),
  shares_received: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUser>;

const UserId = z.object({ id: Id });

export const adminListUsers = defineRoute({
  id: 'adminListUsers',
  method: 'get',
  path: '/admin/users',
  auth: 'admin',
  tag: 'admin',
  summary: 'List and search members (WF-ADM-1)',
  query: PageQuery.extend({
    q: z.string().trim().max(50).optional(),
    status: UserStatus.optional(),
  }),
  status: 200,
  response: page(AdminUser),
});

export const adminUpdateUser = defineRoute({
  id: 'adminUpdateUser',
  method: 'patch',
  path: '/admin/users/{id}',
  auth: 'admin',
  tag: 'admin',
  summary: 'Suspend/unsuspend, promote/demote, set a quota; never the last admin (FR-ADM-01)',
  params: UserId,
  body: z.object({
    status: UserStatus.optional(),
    role: Role.optional(),
    quota_bytes_override: z.number().int().min(0).nullable().optional(),
  }),
  status: 200,
  response: z.object({ user: AdminUser }),
  errors: ['not_found', 'last_admin'],
});

export const adminDeleteUser = defineRoute({
  id: 'adminDeleteUser',
  method: 'delete',
  path: '/admin/users/{id}',
  auth: 'admin',
  tag: 'admin',
  summary: 'Delete a member with WF-ACCT-3 semantics (FR-ADM-01)',
  params: UserId,
  status: 202,
  response: z.object({ deleted: z.literal(true) }),
  errors: ['not_found', 'last_admin'],
});

export const adminPasswordReset = defineRoute({
  id: 'adminPasswordReset',
  method: 'post',
  path: '/admin/users/{id}/password-reset',
  auth: 'admin',
  tag: 'admin',
  summary: 'Create a single-use password-reset link valid for 24 h (FR-ADM-03, WF-ADM-4)',
  params: UserId,
  status: 201,
  response: z.object({ reset_url: z.string(), expires_at: Timestamp }),
  errors: ['not_found'],
});

export const adminGetSettings = defineRoute({
  id: 'adminGetSettings',
  method: 'get',
  path: '/admin/settings',
  auth: 'admin',
  tag: 'admin',
  summary: 'Instance settings (FR-ADM-02)',
  status: 200,
  response: InstanceSettings,
});

export const adminUpdateSettings = defineRoute({
  id: 'adminUpdateSettings',
  method: 'patch',
  path: '/admin/settings',
  auth: 'admin',
  tag: 'admin',
  summary: 'Change instance settings; validated and audited (FR-ADM-02, WF-ADM-3)',
  body: InstanceSettingsPatch,
  status: 200,
  response: InstanceSettings,
});

export const adminStorage = defineRoute({
  id: 'adminStorage',
  method: 'get',
  path: '/admin/storage',
  auth: 'admin',
  tag: 'admin',
  summary: 'Storage overview and the next retention run (FR-ADM-04, WF-ADM-5)',
  status: 200,
  response: z.object({
    total_bytes: z.number().int(),
    per_user: z.array(z.object({ user: PublicUser, bytes: z.number().int() })),
    videos_by_state: z.record(VideoState, z.number().int()),
    retention_days: z.number().int(),
    next_retention_run: Timestamp,
  }),
});

export const adminRunRetention = defineRoute({
  id: 'adminRunRetention',
  method: 'post',
  path: '/admin/retention/run',
  auth: 'admin',
  tag: 'admin',
  summary: 'Run retention now (FR-VID-06, WF-ADM-5)',
  body: z.object({}),
  status: 202,
  response: z.object({ queued: z.literal(true) }),
});

export const AuditEntry = z.object({
  id: z.number().int(),
  actor: PublicUser.nullable(),
  actor_id: Id.nullable(),
  action: z.string(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  ip: z.string().nullable(),
  created_at: Timestamp,
});

export const adminAudit = defineRoute({
  id: 'adminAudit',
  method: 'get',
  path: '/admin/audit',
  auth: 'admin',
  tag: 'admin',
  summary: 'Audit log, newest first, filterable by actor, action and date (FR-ADM-05, WF-ADM-6)',
  query: PageQuery.extend({
    actor: Id.optional(),
    action: z.string().trim().max(60).optional(),
    before: Timestamp.optional(),
  }),
  status: 200,
  response: page(AuditEntry),
});

export const usePasswordReset = defineRoute({
  id: 'usePasswordReset',
  method: 'post',
  path: '/auth/password-reset/{token}',
  auth: 'public',
  tag: 'auth',
  summary: 'Set a new password with a reset link; revokes all sessions (FR-ADM-03)',
  params: z.object({ token: z.string().min(10).max(200) }),
  body: z.object({ new_password: Password }),
  status: 204,
  response: null,
  errors: ['reset_invalid', 'rate_limited'],
});

export const deleteMe = defineRoute({
  id: 'deleteMe',
  method: 'delete',
  path: '/me',
  auth: 'member',
  tag: 'me',
  summary: 'Delete my account after re-entering the password (FR-ACCT-03, WF-ACCT-3)',
  body: z.object({ password: z.string().min(1).max(128) }),
  status: 202,
  response: z.object({ deleted: z.literal(true) }),
  errors: ['invalid_credentials', 'last_admin', 'rate_limited'],
});

export const Session = z.object({
  id: Id,
  client: z.enum(['web', 'mobile']),
  user_agent: z.string(),
  created_at: Timestamp,
  last_seen_at: Timestamp,
  current: z.boolean(),
});

export const listSessions = defineRoute({
  id: 'listSessions',
  method: 'get',
  path: '/me/sessions',
  auth: 'member',
  tag: 'me',
  summary: 'My active sessions (FR-ACCT-04)',
  status: 200,
  response: z.object({ items: z.array(Session) }),
});

export const revokeSessionRoute = defineRoute({
  id: 'revokeSession',
  method: 'delete',
  path: '/me/sessions/{id}',
  auth: 'member',
  tag: 'me',
  summary: 'Revoke one of my sessions (FR-ACCT-04)',
  params: z.object({ id: Id }),
  status: 204,
  response: null,
  errors: ['not_found'],
});

export { SelfUser };
