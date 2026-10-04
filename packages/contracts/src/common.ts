// Wire conventions (ADR-0006): snake_case JSON, UUIDv7 ids, RFC 3339 UTC timestamps,
// `{error:{code,message,details?}}` errors, `{items,next_cursor}` cursor pagination.
import { z } from 'zod';

export const API_VERSION = 1;
export const API_PREFIX = '/api/v1';

export const Id = z.uuid();
export const Timestamp = z.iso.datetime({ offset: true });

/** Stable machine error codes and their HTTP status (SDD §2 error mapper). */
export const ERROR_STATUS = {
  validation_failed: 400,
  invite_invalid: 400,
  url_not_allowed: 400,
  query_too_short: 400,
  invalid_reaction: 400,
  upload_incomplete: 400,
  recovery_invalid: 400,
  ceremony_invalid: 400,
  passkey_invalid: 400,
  code_invalid: 400,
  setup_invalid: 401,
  unauthorized: 401,
  invalid_credentials: 401,
  account_suspended: 403,
  forbidden: 403,
  csrf_failed: 403,
  reauth_required: 403,
  not_found: 404,
  video_not_found: 404,
  username_taken: 409,
  already_friends: 409,
  already_watched: 409,
  last_admin: 409,
  last_passkey: 409,
  too_many_passkeys: 409,
  too_many_push_targets: 409,
  export_in_progress: 409,
  cooldown: 409,
  conflict: 409,
  not_playable: 409,
  too_large: 413,
  quota_exceeded: 413,
  storage_full: 507,
  rate_limited: 429,
  internal_error: 500,
  unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const PageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), next_cursor: z.string().nullable() });
}

export const Empty = z.object({});
