import { TestClient, TEST_PEER_HEADER, type TestClientOptions } from '@vidfriends/test-utils';
import { DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildDeps, initSetupToken } from '../../src/bootstrap.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { createApp } from '../../src/http/app.js';
import type { Deps } from '../../src/http/deps.js';
import { allHandlers } from '../../src/http/handlers.js';
import { FakeClock } from '../../src/infra/clock.js';
import { createDatabase } from '../../src/infra/db.js';
import { createLogger } from '../../src/infra/logger.js';
import { createQueue } from '../../src/infra/queue.js';
import { createRealtimeHub } from '../../src/infra/realtime.js';
import { QUEUES, startWorker } from '../../src/jobs/worker.js';
import { createTestDatabase } from './db.js';

export const PUBLIC_URL = 'https://vf.test';

export interface TestServer {
  deps: Deps;
  clock: FakeClock;
  env: Env;
  logs: string[];
  fetch(request: Request): Promise<Response>;
  client(options?: Partial<TestClientOptions>): TestClient;
  close(): Promise<void>;
}

export interface TestServerOptions {
  /** Also run the background worker in-process (media jobs). */
  worker?: boolean;
}

export async function createTestServer(
  envOverrides: Record<string, string> = {},
  depsOverrides: Partial<Deps> = {},
  options: TestServerOptions = {},
): Promise<TestServer> {
  const testDb = await createTestDatabase();
  const s3 = process.env.TEST_S3_ENDPOINT
    ? {
        S3_ENDPOINT: process.env.TEST_S3_ENDPOINT,
        S3_PUBLIC_ENDPOINT: process.env.TEST_S3_ENDPOINT,
        S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? '',
        S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? '',
        // One bucket per test server keeps files isolated.
        S3_BUCKET: `test-${randomBytes(6).toString('hex')}`,
      }
    : {};
  const env = loadEnv({
    NODE_ENV: 'test',
    PUBLIC_URL,
    DATABASE_URL: testDb.url,
    APP_SECRET: 'test-app-secret-0123456789abcdef',
    LOG_LEVEL: 'info',
    WEB_DIST: '/nonexistent',
    RATE_LIMIT_IP_PER_MINUTE: '100000',
    ...s3,
    ...envOverrides,
  });
  const logs: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      logs.push(String(chunk));
      cb();
    },
  });
  const log = createLogger(env.LOG_LEVEL, sink);
  const clock = new FakeClock(new Date());
  const database = createDatabase(env.DATABASE_URL, 5);
  const deps = buildDeps(env, log, {
    database,
    clock,
    // Tests simulate client addresses via a header only this test app trusts.
    peerIp: (c) => c.req.header(TEST_PEER_HEADER) ?? '203.0.113.1',
    ...depsOverrides,
  });
  if (deps.storage) await deps.storage.ensureBucket();
  deps.queue = await createQueue(env.DATABASE_URL, QUEUES, log, {
    supervise: options.worker ?? false,
    schedule: false,
  });
  const worker = options.worker ? await startWorker(deps) : null;
  deps.realtime ??= createRealtimeHub(env.DATABASE_URL, log);
  await deps.realtime.start();
  await initSetupToken(deps);
  const app = createApp(deps, allHandlers());
  const fetch = async (request: Request) => app.fetch(request);
  return {
    deps,
    clock,
    env,
    logs,
    fetch,
    client: (options = {}) => new TestClient(fetch, { baseUrl: PUBLIC_URL, ...options }),
    async close() {
      await deps.realtime?.stop();
      await worker?.stop();
      await deps.queue?.stop();
      if (deps.storage) {
        const all: string[] = [];
        for await (const o of deps.storage.listKeys('')) all.push(o.key);
        await deps.storage.deleteObjects(all).catch(() => {});
        // Each bucket is a SeaweedFS collection with its own volumes; drop it so runs don't pile up.
        const client = new S3Client({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
        });
        await client.send(new DeleteBucketCommand({ Bucket: env.S3_BUCKET })).catch(() => {});
        client.destroy();
      }
      await database.close();
      await testDb.drop();
    },
  };
}
