// NFR-PRIV-01 (no third-party origins in the clients' allowed sources) and NFR-PRIV-03 (personal
// data limited to username, display name, avatar, passkey public keys and activity data).
import { registerOptions } from '@vidfriends/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, PUBLIC_URL, type TestServer } from './support/app.js';

let server: TestServer;
beforeAll(async () => {
  server = await createTestServer();
});
afterAll(async () => server.close());

describe('NFR-PRIV-01: clients load nothing from third parties', () => {
  it('allows only this origin (and the media store) in every CSP source list', async () => {
    const res = await server.client().raw('GET', '/api/v1/instance');
    const csp = res.headers.get('content-security-policy') ?? '';
    const allowed = new Set(["'self'", "'none'", "'unsafe-inline'", 'blob:', 'data:']);
    const media = new URL(server.env.S3_PUBLIC_ENDPOINT ?? PUBLIC_URL).origin;
    for (const directive of csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)) {
      const [, ...sources] = directive.split(/\s+/);
      for (const source of sources) {
        expect(allowed.has(source) || source === media, `${directive} allows ${source}`).toBe(true);
      }
    }
  });
});

describe('NFR-PRIV-03: personal data is minimal', () => {
  it('stores no email, phone or real-name fields for members', async () => {
    const cols = await server.deps.db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'users' order by column_name`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(
      [
        'avatar_key',
        'created_at',
        'display_name',
        'id',
        'last_active_at',
        'webauthn_user_id',
        'quota_bytes_override',
        'role',
        'status',
        'storage_bytes',
        'updated_at',
        'username',
      ].sort(),
    );
  });

  it('registration accepts no contact details', () => {
    const shape = Object.keys(registerOptions.body!.shape);
    expect(shape.sort()).toEqual(['display_name', 'invite_code', 'username'].sort());
  });
});
