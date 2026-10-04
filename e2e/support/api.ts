// API-based seed helpers (TDD §7): E2E arranges state through the public API, not the UI.
import type { APIRequestContext } from '@playwright/test';
import { request } from '@playwright/test';
import { API_PREFIX } from '@vidfriends/contracts';

export const ADMIN = { username: 'alex', password: 'correct-horse-battery-9' } as const;
export const PASSWORD = 'tangerine-orbit-42';

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

  async login(username: string, password: string) {
    return this.post<{ user: { id: string } }>('/auth/login', {
      username,
      password,
      client: 'web',
    });
  }

  async createInvite(body: { max_uses?: number; auto_friend?: boolean } = {}) {
    return this.post<{ code: string; join_url: string; invite: { id: string } }>('/invites', body);
  }

  /** Registers a new member through an invite and logs this context in as them. */
  async register(code: string, username: string, displayName: string) {
    return this.post<{ user: { id: string; username: string } }>('/auth/register', {
      username,
      password: PASSWORD,
      display_name: displayName,
      invite_code: code,
      client: 'web',
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
