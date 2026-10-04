// API-based seed helpers (TDD §7): E2E arranges state through the public API, not the UI.
import type { APIRequestContext } from '@playwright/test';
import { request } from '@playwright/test';
import { API_PREFIX } from '@vidfriends/contracts';
import type { SoftAuthenticator } from '@vidfriends/test-utils/authenticator';
import { adminAuthenticator } from './passkeys';

export const ADMIN = { username: 'alex' } as const;

type Json = Record<string, unknown>;
interface Ceremony {
  ceremony_id: string;
  options: Json;
}

export class Api {
  private csrf = '';
  private constructor(
    readonly ctx: APIRequestContext,
    private readonly origin: string,
  ) {}

  static async create(baseURL: string): Promise<Api> {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    return new Api(ctx, new URL(baseURL).origin);
  }

  private headers(): Record<string, string> {
    return { origin: this.origin, ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}) };
  }

  private async captureCsrf() {
    const state = await this.ctx.storageState();
    this.csrf = state.cookies.find((c) => c.name === 'vf_csrf')?.value ?? '';
  }

  async post<T = unknown>(path: string, data: unknown = {}): Promise<T> {
    const res = await this.ctx.post(API_PREFIX + path, { data, headers: this.headers() });
    if (!res.ok()) throw new Error(`POST ${path} → ${res.status()}: ${await res.text()}`);
    await this.captureCsrf();
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await this.ctx.get(API_PREFIX + path);
    if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Signs in with a passkey from `auth` (FR-AUTH-04). */
  async signIn(auth: SoftAuthenticator) {
    const { ceremony_id, options } = await this.post<Ceremony>('/auth/signin/options');
    return this.post<{ user: { id: string } }>('/auth/signin', {
      ceremony_id,
      credential: auth.get(options),
    });
  }

  /** An API context signed in as the admin claimed by the setup test. */
  static async admin(baseURL: string): Promise<Api> {
    const api = await Api.create(baseURL);
    await api.signIn(adminAuthenticator(baseURL));
    return api;
  }

  async createInvite(body: { max_uses?: number; auto_friend?: boolean } = {}) {
    return this.post<{ code: string; join_url: string; invite: { id: string } }>('/invites', body);
  }

  /** Joins through an invite with a new passkey in `auth` and signs this context in (FR-AUTH-02). */
  async register(code: string, username: string, displayName: string, auth: SoftAuthenticator) {
    const { ceremony_id, options } = await this.post<Ceremony>('/auth/register/options', {
      username,
      display_name: displayName,
      invite_code: code,
    });
    return this.post<{ user: { id: string; username: string } }>('/auth/register', {
      ceremony_id,
      credential: auth.create(options),
    });
  }

  async patch<T = unknown>(path: string, data: unknown = {}): Promise<T> {
    const res = await this.ctx.patch(API_PREFIX + path, { data, headers: this.headers() });
    if (!res.ok()) throw new Error(`PATCH ${path} → ${res.status()}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Adds a fixture link (fake yt-dlp in the E2E worker) and waits for it to settle. */
  async addVideo(
    mode: 'ok' | 'unsupported' = 'ok',
  ): Promise<{ id: string; state: string; title: string }> {
    const { video } = await this.post<{ video: { id: string } }>('/videos', {
      url: `https://www.youtube.com/watch?v=${mode}&e2e=${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    });
    for (let i = 0; i < 120; i++) {
      const res = await this.get<{ video: { id: string; state: string; title: string } }>(
        `/videos/${video.id}`,
      );
      if (['ready', 'link_only', 'failed'].includes(res.video.state)) return res.video;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('video did not settle');
  }

  async dispose() {
    await this.ctx.dispose();
  }
}
