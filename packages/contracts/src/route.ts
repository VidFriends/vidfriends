import type { z } from 'zod';
import type { ErrorCode } from './common.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Who may call a route (SDD §3 layer 1). */
export type AuthLevel = 'public' | 'member' | 'admin';

type AnyObject = z.ZodObject<z.ZodRawShape>;

/**
 * A route definition. The server registers handlers from these, the OpenAPI document is generated
 * from them, and the typed client calls them (ADR-0006, NFR-MAINT-01).
 */
export interface RouteDef<
  P extends AnyObject | undefined = AnyObject | undefined,
  Q extends AnyObject | undefined = AnyObject | undefined,
  B extends z.ZodType | undefined = z.ZodType | undefined,
  R extends z.ZodType | null = z.ZodType | null,
> {
  /** operationId, unique. */
  id: string;
  method: HttpMethod;
  /** OpenAPI-style path relative to `/api/v1`, e.g. `/invites/{id}`. */
  path: string;
  auth: AuthLevel;
  summary: string;
  tag: string;
  params?: P;
  query?: Q;
  body?: B;
  /** Success status. */
  status: 200 | 201 | 202 | 204 | 302;
  /** Additional success statuses with the same body (e.g. 200 when an existing video is reused). */
  altStatus?: (200 | 201)[];
  /** Response body schema, or null for 204 and 302 (redirect). */
  response: R;
  /** Domain errors this route can return in addition to the generic ones. */
  errors?: ErrorCode[];
  /** A streamed response instead of JSON (the handler returns a `Response`). */
  stream?: 'text/event-stream';
}

export function defineRoute<
  P extends AnyObject | undefined = undefined,
  Q extends AnyObject | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType | null = null,
>(def: RouteDef<P, Q, B, R>): RouteDef<P, Q, B, R> {
  return def;
}

export type ParamsOf<T> =
  T extends RouteDef<infer P, infer _Q, infer _B, infer _R>
    ? P extends AnyObject
      ? z.input<P>
      : undefined
    : never;
export type QueryOf<T> =
  T extends RouteDef<infer _P, infer Q, infer _B, infer _R>
    ? Q extends AnyObject
      ? z.input<Q>
      : undefined
    : never;
export type BodyOf<T> =
  T extends RouteDef<infer _P, infer _Q, infer B, infer _R>
    ? B extends z.ZodType
      ? z.input<B>
      : undefined
    : never;
export type ResponseOf<T> =
  T extends RouteDef<infer _P, infer _Q, infer _B, infer R>
    ? R extends z.ZodType
      ? z.output<R>
      : void
    : never;

/** Path parameter names in a route path, e.g. `/a/{id}/b/{x}` → ['id','x']. */
export function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
}

export function fillPath(path: string, params: Record<string, string> | undefined): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`missing path parameter ${name}`);
    return encodeURIComponent(value);
  });
}
