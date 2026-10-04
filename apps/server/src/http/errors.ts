import { ERROR_STATUS, type ErrorCode } from '@vidfriends/contracts';

/** A typed domain error that maps to a stable API error code (SDD §2). */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code.replace(/_/g, ' '));
    this.name = 'ApiError';
    this.status = ERROR_STATUS[code];
  }
}

export const notFound = (): ApiError => new ApiError('not_found', 'Not found');

/** Field-level validation failure, e.g. `fieldError('password', 'password_common')`. */
export function fieldError(field: string, reason: string, message?: string): ApiError {
  return new ApiError('validation_failed', message ?? 'Invalid request', {
    fields: { [field]: reason },
  });
}
