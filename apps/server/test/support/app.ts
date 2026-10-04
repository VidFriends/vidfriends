import { TestClient, TEST_PEER_HEADER, type TestClientOptions } from '@vidfriends/test-utils';
import { Writable } from 'node:stream';
import { buildDeps, initSetupToken } from '../../src/bootstrap.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { createApp } from '../../src/http/app.js';
import type { Deps } from '../../src/http/deps.js';
import { allHandlers } from '../../src/http/handlers.js';
import { FakeClock } from '../../src/infra/clock.js';
import { createDatabase } from '../../src/infra/db.js';
import { createLogger } from '../../src/infra/logger.js';
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

export async function createTestServer(
  envOverrides: Record<string, string> = {},
  depsOverrides: Partial<Deps> = {},
): Promise<TestServer> {
  const testDb = await createTestDatabase();
  const env = loadEnv({
    NODE_ENV: 'test',
    PUBLIC_URL,
    DATABASE_URL: testDb.url,
    APP_SECRET: 'test-app-secret-0123456789abcdef',
    LOG_LEVEL: 'info',
    WEB_DIST: '/nonexistent',
    RATE_LIMIT_IP_PER_MINUTE: '100000',
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
      await database.close();
      await testDb.drop();
    },
  };
}
