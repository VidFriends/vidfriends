// A typed HTTP test client that drives the full app (SDD §2: route tests always go through the
// real middleware stack). Keeps cookies like a browser and sends the CSRF header + Origin.
import {
  API_PREFIX,
  fillPath,
  type BodyOf,
  type ParamsOf,
  type QueryOf,
  type ResponseOf,
  type RouteDef,
} from '@vidfriends/contracts';
import { SoftAuthenticator } from './authenticator.js';

export type FetchLike = (request: Request) => Promise<Response>;

export interface CallOptions<R extends RouteDef> {
  params?: ParamsOf<R>;
  query?: QueryOf<R>;
  body?: BodyOf<R>;
  headers?: Record<string, string>;
}

export interface CallResult<T> {
  status: number;
  body: T;
  headers: Headers;
}

export interface TestClientOptions {
  baseUrl: string;
  /** Simulated client IP, sent in the test-only peer header the test app trusts. */
  ip?: string;
  /** Use a bearer token instead of cookies. */
  bearer?: string;
}

let ipCounter = 0;
export function nextTestIp(): string {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export const TEST_PEER_HEADER = 'x-test-peer-ip';

export class TestClient {
  readonly cookies = new Map<string, string>();
  bearer: string | undefined;
  ip: string;
  origin: string | null;
  /** This client's passkeys (a software authenticator for the instance's origin). */
  readonly authenticator: SoftAuthenticator;

  constructor(
    private readonly fetchFn: FetchLike,
    private readonly options: TestClientOptions,
  ) {
    this.bearer = options.bearer;
    this.ip = options.ip ?? nextTestIp();
    this.origin = new URL(options.baseUrl).origin;
    this.authenticator = new SoftAuthenticator(this.origin);
  }

  /** A raw request through the app; records Set-Cookie like a browser. */
  async raw(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const headers = new Headers(init.headers);
    headers.set(TEST_PEER_HEADER, this.ip);
    if (this.bearer) headers.set('authorization', `Bearer ${this.bearer}`);
    if (this.cookies.size) {
      headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    if (!['GET', 'HEAD'].includes(method)) {
      if (this.origin && !headers.has('origin')) headers.set('origin', this.origin);
      const csrf = this.cookies.get('vf_csrf');
      if (csrf && !headers.has('x-csrf-token')) headers.set('x-csrf-token', csrf);
    }
    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.body);
    }
    const res = await this.fetchFn(
      new Request(new URL(path, this.options.baseUrl), { method, headers, body }),
    );
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const idx = pair?.indexOf('=') ?? -1;
      if (!pair || idx < 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  async call<R extends RouteDef>(
    route: R,
    options: CallOptions<R> = {},
  ): Promise<
    CallResult<ResponseOf<R> & { error?: { code: string; message: string; details?: unknown } }>
  > {
    let path =
      API_PREFIX + fillPath(route.path, options.params as Record<string, string> | undefined);
    if (options.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query as Record<string, unknown>)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) path += `?${s}`;
    }
    const body =
      options.body !== undefined ? options.body : route.body !== undefined ? {} : undefined;
    const res = await this.raw(route.method.toUpperCase(), path, {
      body,
      headers: options.headers,
    });
    const text = await res.text();
    return {
      status: res.status,
      body: (text ? JSON.parse(text) : undefined) as never,
      headers: res.headers,
    };
  }

  /** Like `call`, but throws unless the status is the route's success status. */
  async ok<R extends RouteDef>(route: R, options: CallOptions<R> = {}): Promise<ResponseOf<R>> {
    const res = await this.call(route, options);
    const okStatuses = [route.status, ...(route.altStatus ?? [])] as number[];
    if (!okStatuses.includes(res.status)) {
      throw new Error(
        `${route.id} expected ${route.status}, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }
    return res.body as ResponseOf<R>;
  }
}
