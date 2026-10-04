import { getInstance, listInvites, login, revokeInvite } from '@vidfriends/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildPath, createApiClient } from './index.js';

describe('buildPath', () => {
  it('fills params and serialises defined query values', () => {
    expect(buildPath(revokeInvite, { params: { id: 'abc' } })).toBe('/api/v1/invites/abc');
    expect(buildPath(listInvites, { query: { scope: 'all', limit: 5, cursor: undefined } })).toBe(
      '/api/v1/invites?scope=all&limit=5',
    );
  });
});

describe('createApiClient', () => {
  it('sends the CSRF header on unsafe cookie requests and decodes error envelopes', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'invalid_credentials', message: 'nope' } }), {
          status: 401,
        }),
    );
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      auth: { kind: 'cookie', csrfToken: () => 'tok' },
      fetch: fetchMock,
      onUnauthorized,
    });
    const err = await api
      .call(login, { body: { username: 'a', password: 'b', client: 'web' } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('invalid_credentials');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('tok');
    // Login is public: a 401 there is not a session expiry.
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('uses bearer auth for mobile and reports network failures', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const api = createApiClient({
      baseUrl: 'https://vf.example/',
      auth: { kind: 'bearer', token: () => 't' },
      fetch: fetchMock,
    });
    const err = (await api.call(getInstance).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('network_error');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://vf.example/api/v1/instance',
    );
  });
});
