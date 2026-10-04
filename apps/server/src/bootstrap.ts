import { getConnInfo } from '@hono/node-server/conninfo';
import { lookup } from 'node:dns/promises';
import type { Env } from './config/env.js';
import { systemClock, type Clock } from './infra/clock.js';
import { createDatabase, type Database } from './infra/db.js';
import { createTrustedProxies } from './infra/ip.js';
import type { Logger } from './infra/logger.js';
import { createRateLimiter } from './infra/rate-limit.js';
import { createStorage } from './infra/storage.js';
import {
  createExpoPushSender,
  createWebPushSender,
  vapidKeys,
  type PushSender,
} from './infra/push/channels.js';
import { newToken } from './infra/tokens.js';
import type { Deps } from './http/deps.js';
import { adminExists } from './modules/auth/service.js';

export function buildDeps(
  env: Env,
  log: Logger,
  overrides: Partial<Deps> & { database?: Database; clock?: Clock } = {},
): Deps {
  const database = overrides.database ?? createDatabase(env.DATABASE_URL);
  const clock = overrides.clock ?? systemClock;
  const storage = overrides.storage !== undefined ? overrides.storage : createStorage(env);
  let senders: Promise<Partial<Record<'webpush' | 'expo', PushSender>>> | null = null;
  return {
    pushSenders: () =>
      (senders ??= vapidKeys(database.db, env.APP_SECRET).then((keys) => ({
        webpush: createWebPushSender(keys, env.PUBLIC_URL),
        expo: createExpoPushSender({ accessToken: env.EXPO_ACCESS_TOKEN }),
      }))),
    env,
    database,
    db: database.db,
    clock,
    log,
    rateLimiter: createRateLimiter(clock),
    trustedProxies: createTrustedProxies(env.TRUSTED_PROXIES),
    setup: { token: null },
    storage,
    queue: null,
    net: {
      lookup: (host) => lookup(host, { all: true, verbatim: true }),
      fetch: (url, init) => fetch(url, init),
    },
    peerIp: (c) => {
      try {
        return getConnInfo(c).remote.address;
      } catch {
        return undefined;
      }
    },
    readinessChecks: storage ? [{ name: 'storage', check: () => storage.ping() }] : [],
    ...overrides,
  };
}

/** FR-AUTH-01: while no admin exists, generate a one-time setup token and log it with the URL. */
export async function initSetupToken(deps: Deps): Promise<void> {
  if (await adminExists(deps.db)) {
    deps.setup.token = null;
    return;
  }
  deps.setup.token = newToken();
  deps.log.warn(
    { setup_url: `${deps.env.PUBLIC_URL}/setup` },
    `This instance is unclaimed. Open ${deps.env.PUBLIC_URL}/setup and enter the setup token: ${deps.setup.token}`,
  );
}
