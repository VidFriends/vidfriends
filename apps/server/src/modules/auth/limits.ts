import type { Deps } from '../../http/deps.js';
import type { AppContext } from '../../http/context.js';
import { ApiError } from '../../http/errors.js';

/** Auth endpoints: ≤ RATE_LIMIT_AUTH_PER_MINUTE per client IP and per username (NFR-SEC-06). */
export function limitAuth(deps: Deps, c: AppContext, ip: string, username?: string): void {
  const limit = deps.env.RATE_LIMIT_AUTH_PER_MINUTE;
  const keys = [`auth-ip:${ip}`];
  if (username) keys.push(`auth-user:${username.toLowerCase()}`);
  for (const key of keys) {
    const r = deps.rateLimiter.hit(key, limit, 60_000);
    if (!r.allowed) {
      c.header('Retry-After', String(r.retryAfterSeconds));
      throw new ApiError('rate_limited', 'Too many attempts. Try again in a minute.');
    }
  }
}
