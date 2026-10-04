// Registers handlers from the contract route definitions (ADR-0006/0007, NFR-MAINT-01).
// Every contract route must have exactly one handler; startup fails otherwise.
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { API_PREFIX, allRoutes, type RouteDef } from '@vidfriends/contracts';
import type { MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import type { Deps } from './deps.js';
import type { AppContext, AppEnv, Viewer } from './context.js';
import { ApiError } from './errors.js';

type Out<S> = [S] extends [z.ZodType] ? z.output<S> : undefined;
type ParamsS<R> = R extends RouteDef<infer P, infer _Q, infer _B, infer _R> ? P : never;
type QueryS<R> = R extends RouteDef<infer _P, infer Q, infer _B, infer _R> ? Q : never;
type BodyS<R> = R extends RouteDef<infer _P, infer _Q, infer B, infer _R> ? B : never;
type ResS<R> = R extends RouteDef<infer _P, infer _Q, infer _B, infer Res> ? Res : never;

export interface HandlerInput<R extends RouteDef> {
  c: AppContext;
  deps: Deps;
  viewer: R['auth'] extends 'public' ? Viewer | null : Viewer;
  params: Out<ParamsS<R>>;
  query: Out<QueryS<R>>;
  body: Out<BodyS<R>>;
  ip: string;
}

/** Explicit status for routes with alternative success statuses. */
export class Reply<T> {
  constructor(
    readonly status: number,
    readonly body: T,
  ) {}
}

/** A redirect result for routes with `status: 302`. */
export class Redirect {
  constructor(readonly location: string) {}
}

type ResponseIn<R extends RouteDef> = [ResS<R>] extends [z.ZodType] ? z.input<ResS<R>> : void;

export type HandlerResult<R extends RouteDef> = ResponseIn<R> | Reply<ResponseIn<R>> | Redirect;

export interface RouteHandler<R extends RouteDef = RouteDef> {
  route: R;
  fn: (input: HandlerInput<R>) => Promise<HandlerResult<R>>;
}

export function handler<R extends RouteDef>(
  route: R,
  fn: (input: HandlerInput<R>) => Promise<HandlerResult<R>>,
): RouteHandler<R> {
  return { route, fn };
}

function authGuard(route: RouteDef, deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (route.auth !== 'public') {
      const viewer = c.get('viewer');
      if (!viewer) throw new ApiError('unauthorized', 'Authentication required');
      if (route.auth === 'admin' && viewer.role !== 'admin') {
        throw new ApiError('forbidden', 'Admin only');
      }
      const limit = deps.rateLimiter.hit(
        `user:${viewer.id}`,
        deps.env.RATE_LIMIT_USER_PER_MINUTE,
        60_000,
      );
      if (!limit.allowed) {
        c.header('Retry-After', String(limit.retryAfterSeconds));
        throw new ApiError('rate_limited', 'Too many requests');
      }
    }
    await next();
  };
}

export function registerRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: Deps,
  handlers: RouteHandler<RouteDef>[],
): void {
  const byId = new Map<string, RouteHandler<RouteDef>>();
  for (const h of handlers) {
    if (byId.has(h.route.id)) throw new Error(`duplicate handler for route ${h.route.id}`);
    byId.set(h.route.id, h);
  }
  const missing = allRoutes.filter((r) => !byId.has(r.id)).map((r) => r.id);
  if (missing.length) throw new Error(`routes without handlers: ${missing.join(', ')}`);
  const unknown = [...byId.keys()].filter((id) => !allRoutes.some((r) => r.id === id));
  if (unknown.length) throw new Error(`handlers for unknown routes: ${unknown.join(', ')}`);

  for (const route of allRoutes) {
    const h = byId.get(route.id) as RouteHandler<RouteDef>;
    const openapiRoute = createRoute({
      method: route.method,
      path: `${API_PREFIX}${route.path}`,
      middleware: [authGuard(route, deps)] as never,
      request: {
        ...(route.params ? { params: route.params } : {}),
        ...(route.query ? { query: route.query } : {}),
        ...(route.body
          ? {
              body: {
                required: true,
                content: { 'application/json': { schema: route.body as z.ZodType } },
              },
            }
          : {}),
      },
      responses: { [route.status]: { description: 'OK' } },
    });

    app.openapi(openapiRoute, (async (c: AppContext) => {
      const req = c.req as unknown as { valid(target: string): unknown };
      const result = await h.fn({
        c,
        deps,
        viewer: c.get('viewer') as Viewer,
        params: (route.params ? req.valid('param') : undefined) as never,
        query: (route.query ? req.valid('query') : undefined) as never,
        body: (route.body ? req.valid('json') : undefined) as never,
        ip: c.get('clientIp'),
      });
      if (result instanceof Redirect) return c.redirect(result.location, 302);
      let status: number = route.status;
      let body: unknown = result;
      if (result instanceof Reply) {
        status = result.status;
        body = result.body;
      }
      if (!route.response) return c.body(null, status as 204);
      // Responses are always parsed against the contract: unknown keys are stripped (no accidental
      // leaks) and a mismatch is a server bug (SDD §2 response schema check).
      const parsed = route.response.safeParse(body);
      if (!parsed.success) {
        c.get('log').error(
          { route: route.id, issues: parsed.error.issues.slice(0, 5) },
          'response failed contract validation',
        );
        throw new Error(`response for ${route.id} does not match its contract`);
      }
      return c.json(parsed.data as object, status as 200);
    }) as never);
  }
}
