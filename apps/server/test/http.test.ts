// M1-T4: middleware chain, security headers (NFR-SEC-04), health (NFR-OPS-03), error envelope.
import { getInstance } from '@vidfriends/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from './support/app.js';

let server: TestServer;
beforeAll(async () => {
  server = await createTestServer();
});
afterAll(async () => server.close());

describe('HTTP pipeline', () => {
  it('sets security headers, a request id and no-store on API responses', async () => {
    const res = await server.client().raw('GET', '/api/v1/instance');
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toMatch(/.{8,}/);
  });

  it('returns the error envelope for unknown API routes', async () => {
    const res = await server.client().raw('GET', '/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No such endpoint' } });
  });

  it('reports validation failures per field without leaking internals', async () => {
    const res = await server.client().raw('POST', '/api/v1/auth/login', { body: { username: 5 } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; details: { fields: Record<string, string> } };
    };
    expect(body.error.code).toBe('validation_failed');
    expect(Object.keys(body.error.details.fields)).toEqual(
      expect.arrayContaining(['username', 'password']),
    );
  });

  it('rejects non-JSON bodies', async () => {
    const res = await server.fetch(
      new Request('https://vf.test/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', origin: 'https://vf.test' },
        body: 'username=x',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('serves liveness and readiness', async () => {
    expect((await server.client().raw('GET', '/healthz')).status).toBe(200);
    const ready = await server.client().raw('GET', '/readyz');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ checks: { database: 'ok' } });
  });

  it('exposes instance info publicly (FR-PAIR-01)', async () => {
    const info = await server.client().ok(getInstance);
    expect(info).toMatchObject({
      name: 'VidFriends',
      api_version: 1,
      signup_mode: 'invite_only',
      setup_complete: false,
      retention_days: 90,
    });
  });

  it('applies a per-IP rate limit', async () => {
    const limited = await createTestServer({ RATE_LIMIT_IP_PER_MINUTE: '3' });
    try {
      const c = limited.client();
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await c.raw('GET', '/api/v1/instance')).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
    } finally {
      await limited.close();
    }
  });

  it('logs the route pattern, never concrete paths that carry codes (NFR-PRIV-02)', async () => {
    await server.client().raw('GET', '/api/v1/invites/SECRETCODE123/preview');
    const lines = server.logs.join('');
    expect(lines).not.toContain('SECRETCODE123');
    expect(lines).toContain('/api/v1/invites/:code/preview');
  });
});

describe('readiness when the database is down', () => {
  it('returns 503', async () => {
    const s = await createTestServer();
    await s.deps.database.close();
    const res = await s.client().raw('GET', '/readyz');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      status: 'unavailable',
      checks: { database: 'unavailable' },
    });
    await s.close().catch(() => {});
  });
});
