// M2-T3: presigned PUT/GET round trip against the S3 store, including Range (ADR-0009/0015).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_URL_TTL_SECONDS } from '../src/infra/storage.js';
import { keys } from '../src/infra/keys.js';
import { createTestServer, type TestServer } from './support/app.js';
import { hasS3 } from './support/s3.js';

let server: TestServer;
beforeAll(async () => {
  server = await createTestServer();
});
afterAll(async () => server.close());

describe.skipIf(!hasS3)('object storage', () => {
  it('round-trips through presigned PUT and GET with Range support', async () => {
    const storage = server.deps.storage!;
    const key = keys.upload('roundtrip-test');
    const body = Buffer.from('0123456789abcdef');
    const put = await storage.presignPut(key, 'video/mp4', body.length);
    const putRes = await fetch(put, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'video/mp4' },
    });
    expect(putRes.status).toBe(200);

    const get = await storage.presignGet(key);
    const full = await fetch(get);
    expect(Buffer.from(await full.arrayBuffer()).equals(body)).toBe(true);
    const range = await fetch(get, { headers: { Range: 'bytes=4-7' } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe('4567');
    expect(new URL(get).searchParams.get('X-Amz-Expires')).toBe(String(MAX_URL_TTL_SECONDS));
  });

  it('keeps the bucket private and rejects tampered or mismatched uploads', async () => {
    const storage = server.deps.storage!;
    const key = keys.upload('private-test');
    await storage.putObject(key, Buffer.from('secret'), 'text/plain');
    const get = new URL(await storage.presignGet(key));
    const anonymous = await fetch(`${get.origin}${get.pathname}`);
    expect(anonymous.status).toBe(403);
    get.searchParams.set('X-Amz-Signature', '0'.repeat(64));
    expect((await fetch(get)).status).toBe(403);
    // The signed Content-Length must match: a bigger body is refused.
    const put = await storage.presignPut(keys.upload('sized'), 'video/mp4', 4);
    const res = await fetch(put, {
      method: 'PUT',
      body: Buffer.from('more than four'),
      headers: { 'content-type': 'video/mp4' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('caps URL lifetime at 15 minutes (BR-MED-7)', async () => {
    const url = await server.deps.storage!.presignGet('media/x/main.mp4', 3600);
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it('is reported by /readyz', async () => {
    const res = await server.client().raw('GET', '/readyz');
    expect(await res.json()).toMatchObject({ checks: { database: 'ok', storage: 'ok' } });
  });
});
