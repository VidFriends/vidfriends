import { serveStatic } from '@hono/node-server/serve-static';
import { OpenAPIHono } from '@hono/zod-openapi';
import { ERROR_STATUS, type ErrorEnvelope } from '@vidfriends/contracts';
import { sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { csrfTokenFor, sessionMiddleware } from '../modules/auth/sessions.js';
import type { AppEnv } from './context.js';
import type { Deps } from './deps.js';
import { ApiError } from './errors.js';
import {
  clientIpAndRateLimit,
  csrf,
  requestId,
  requestLogger,
  securityHeaders,
} from './middleware.js';
import { registerRoutes, type RouteHandler } from './register.js';

function envelope(
  code: keyof typeof ERROR_STATUS,
  message: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

function zodDetails(error: z.ZodError): Record<string, unknown> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return { fields };
}

export function resolveWebDist(configured: string): string | null {
  const dir = configured
    ? resolve(configured)
    : fileURLToPath(new URL('../../../web/dist', import.meta.url));
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

export function createApp(deps: Deps, handlers: RouteHandler[]): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ApiError(
          'validation_failed',
          'Invalid request',
          zodDetails(result.error as z.ZodError),
        );
      }
    },
  });

  app.use('*', requestId());
  app.use('*', requestLogger(deps));
  app.use('*', securityHeaders(deps));

  // Ops endpoints live outside /api/v1 (LLD §3).
  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    const checks: Record<string, string> = {};
    let ok = true;
    try {
      await deps.db.execute(sql`select 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'unavailable';
      ok = false;
    }
    for (const probe of deps.readinessChecks) {
      try {
        await probe.check();
        checks[probe.name] = 'ok';
      } catch {
        checks[probe.name] = 'unavailable';
        ok = false;
      }
    }
    return c.json({ status: ok ? 'ok' : 'unavailable', checks }, ok ? 200 : 503);
  });

  app.use('*', clientIpAndRateLimit(deps));
  app.use('*', sessionMiddleware(deps));
  app.use(
    '*',
    csrf(deps, (hash) => csrfTokenFor(deps.env.APP_SECRET, hash)),
  );

  registerRoutes(app, deps, handlers);

  app.all('/api/*', () => {
    throw new ApiError('not_found', 'No such endpoint');
  });

  // The SPA is served by the instance itself (FR-PAIR-02, TDD §3).
  const webDist = resolveWebDist(deps.env.WEB_DIST);
  if (webDist) {
    const indexHtml = readFileSync(join(webDist, 'index.html'), 'utf8');
    app.use(
      '/assets/*',
      serveStatic({
        root: webDist,
        onFound: (_path, c) => {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.use(
      '*',
      serveStatic({
        root: webDist,
        onFound: (path, c) => {
          const noCache =
            path.endsWith('sw.js') || path.endsWith('.webmanifest') || path.endsWith('.html');
          c.header('Cache-Control', noCache ? 'no-cache' : 'public, max-age=3600');
        },
      }),
    );
    app.get('*', (c) => {
      c.header('Cache-Control', 'no-cache');
      return c.html(indexHtml);
    });
  } else {
    app.get('*', (c) =>
      c.text(
        'VidFriends API is running. The web app has not been built (pnpm --filter @vidfriends/web build).',
        404,
      ),
    );
  }

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(envelope(err.code, err.message, err.details), err.status as 400);
    }
    if (err instanceof HTTPException && err.status < 500) {
      const code = err.status === 404 ? 'not_found' : 'validation_failed';
      return c.json(
        envelope(code, err.status === 404 ? 'Not found' : 'Invalid request'),
        ERROR_STATUS[code],
      );
    }
    (c.get('log') ?? deps.log).error({ err }, 'unhandled error');
    // Never leak internals (SDD §2).
    return c.json(envelope('internal_error', 'Something went wrong'), 500);
  });

  return app;
}
