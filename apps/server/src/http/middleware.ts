// Request pipeline (SDD §2): requestId → logger → securityHeaders → clientIp + rateLimit(ip)
// → session → csrf → (per route) auth guard + rateLimit(user) → validation → handler → error mapper.
import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import { resolveClientIp } from '../infra/ip.js';
import { httpDuration } from '../infra/metrics.js';
import type { AppEnv } from './context.js';
import type { Deps } from './deps.js';
import { ApiError } from './errors.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}

/**
 * Logs one line per request. Only the matched route pattern is logged, never the concrete path,
 * because paths can carry invite codes and reset tokens (NFR-PRIV-02).
 */
export function requestLogger(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    const log = deps.log.child({ req_id: c.get('requestId') });
    c.set('log', log);
    await next();
    const viewer = c.get('viewer');
    let route = matchedRoutes(c)
      .filter((r) => r.method !== 'ALL' && r.path !== '*' && r.path !== '/*')
      .at(-1)?.path;
    if (!route) {
      route = c.req.path.startsWith('/api/') ? '(unmatched api)' : '(web)';
    }
    httpDuration.observe(
      { method: c.req.method, route, status: String(c.res.status) },
      (performance.now() - start) / 1000,
    );
    log.info(
      {
        method: c.req.method,
        route,
        status: c.res.status,
        ms: Math.round(performance.now() - start),
        user_id: viewer?.id,
      },
      'request',
    );
  };
}

export function securityHeaders(deps: Deps): MiddlewareHandler<AppEnv> {
  const mediaOrigins = [deps.env.S3_PUBLIC_ENDPOINT, deps.env.S3_ENDPOINT]
    .filter((u): u is string => Boolean(u))
    .map((u) => new URL(u).origin)
    .filter((o) => o !== new URL(deps.env.PUBLIC_URL).origin);
  const media = [...new Set(mediaOrigins)].join(' ');
  // LLD §5. 'unsafe-inline' for styles is required by Radix positioning.
  const csp = [
    "default-src 'self'",
    `img-src 'self' blob: data: ${media}`.trim(),
    `media-src 'self' blob: ${media}`.trim(),
    "connect-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  const https = deps.env.PUBLIC_URL.startsWith('https:');
  return async (c, next) => {
    await next();
    c.header('Content-Security-Policy', csp);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    if (https) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
  };
}

export function clientIpAndRateLimit(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = resolveClientIp(
      deps.peerIp(c),
      c.req.header('x-forwarded-for'),
      deps.trustedProxies,
    );
    c.set('clientIp', ip);
    if (c.req.path.startsWith('/api/')) {
      const limit = deps.rateLimiter.hit(`ip:${ip}`, deps.env.RATE_LIMIT_IP_PER_MINUTE, 60_000);
      if (!limit.allowed) {
        c.header('Retry-After', String(limit.retryAfterSeconds));
        throw new ApiError('rate_limited', 'Too many requests');
      }
    }
    await next();
  };
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF (NFR-SEC-04, LLD §5): unsafe requests must not come from a foreign Origin, and
 * cookie-authenticated unsafe requests must carry `X-CSRF-Token` matching the `vf_csrf` cookie and
 * the session-bound HMAC, plus an Origin equal to PUBLIC_URL. Bearer requests are exempt.
 */
export function csrf(
  deps: Deps,
  expected: (sessionHash: Buffer) => string,
): MiddlewareHandler<AppEnv> {
  const publicOrigin = new URL(deps.env.PUBLIC_URL).origin;
  return async (c, next) => {
    if (UNSAFE.has(c.req.method) && c.req.path.startsWith('/api/')) {
      const origin = c.req.header('origin');
      if (origin && origin !== publicOrigin)
        throw new ApiError('csrf_failed', 'Cross-origin request');
      const viewer = c.get('viewer');
      if (viewer?.via === 'cookie') {
        if (!origin) throw new ApiError('csrf_failed', 'Missing Origin');
        const header = c.req.header('x-csrf-token');
        const cookie = getCookieValue(c.req.header('cookie'), 'vf_csrf');
        const want = expected(viewer.sessionHash);
        if (!header || header !== cookie || header !== want) {
          throw new ApiError('csrf_failed', 'Missing or invalid CSRF token');
        }
      }
    }
    await next();
  };
}

export function getCookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
