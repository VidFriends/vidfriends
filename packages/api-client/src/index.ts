// Thin typed fetch client built from the contract route definitions (ADR-0006, SDD §5).
import {
  API_PREFIX,
  fillPath,
  type BodyOf,
  type ErrorCode,
  type ParamsOf,
  type QueryOf,
  type ResponseOf,
  type RouteDef,
} from '@vidfriends/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network_error',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field validation reasons, e.g. `{ password: 'password_common' }`. */
  get fields(): Record<string, string> {
    const fields = this.details?.fields;
    return fields && typeof fields === 'object' ? (fields as Record<string, string>) : {};
  }
}

export interface RequestOptions<R extends RouteDef> {
  params?: ParamsOf<R>;
  query?: QueryOf<R>;
  body?: BodyOf<R>;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  /** Instance origin, e.g. `https://vf.example.org`; empty for same-origin (web). */
  baseUrl?: string;
  /** `cookie` (web, same origin) or `bearer` (mobile). */
  auth:
    | { kind: 'cookie'; csrfToken: () => string | undefined }
    | { kind: 'bearer'; token: () => string | undefined };
  /** Called for any 401 on a non-public route (L-17: one global session-expired path). */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
}

export interface ApiClient {
  call<R extends RouteDef>(route: R, options?: RequestOptions<R>): Promise<ResponseOf<R>>;
  url(path: string): string;
}

export function buildPath<R extends RouteDef>(route: R, options: RequestOptions<R> = {}): string {
  let path =
    API_PREFIX + fillPath(route.path, options.params as Record<string, string> | undefined);
  if (options.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) path += `?${s}`;
  }
  return path;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const base = (config.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  return {
    url: (path) => base + path,
    async call(route, options = {}) {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (config.auth.kind === 'bearer') {
        const token = config.auth.token();
        if (token) headers.authorization = `Bearer ${token}`;
      } else if (route.method !== 'get') {
        const csrf = config.auth.csrfToken();
        if (csrf) headers['x-csrf-token'] = csrf;
      }
      let body: string | undefined;
      if (route.body) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body ?? {});
      }
      let res: Response;
      try {
        res = await doFetch(base + buildPath(route, options), {
          method: route.method.toUpperCase(),
          headers,
          body,
          credentials: config.auth.kind === 'cookie' ? 'same-origin' : 'omit',
          signal: options.signal,
        });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err;
        throw new ApiError(0, 'network_error', 'Could not reach the server');
      }
      const text = await res.text();
      let json: unknown = undefined;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      if (!res.ok) {
        const e = (
          json as {
            error?: { code: ErrorCode; message: string; details?: Record<string, unknown> };
          }
        )?.error;
        const error = new ApiError(
          res.status,
          e?.code ?? 'internal_error',
          e?.message ?? res.statusText,
          e?.details,
        );
        if (res.status === 401 && route.auth !== 'public') config.onUnauthorized?.();
        throw error;
      }
      return json as ResponseOf<typeof route>;
    },
  };
}

/** Reads a cookie in the browser (for the double-submit CSRF token). */
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export type { ResponseOf, BodyOf, ParamsOf, QueryOf } from '@vidfriends/contracts';
