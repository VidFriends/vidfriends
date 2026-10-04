import type { BlockList } from 'node:net';
import type { Env } from '../config/env.js';
import type { Clock } from '../infra/clock.js';
import type { Database, Db } from '../infra/db.js';
import type { Logger } from '../infra/logger.js';
import type { RateLimiter } from '../infra/rate-limit.js';
import type { Storage } from '../infra/storage.js';
import type { AppContext } from './context.js';

/** One-time setup token state (FR-AUTH-01): in memory only, regenerated per boot while unclaimed. */
export interface SetupState {
  token: string | null;
}

/** Everything a request handler may use. Built once at startup; tests inject fakes. */
export interface Deps {
  env: Env;
  database: Database;
  db: Db;
  clock: Clock;
  log: Logger;
  rateLimiter: RateLimiter;
  trustedProxies: BlockList;
  setup: SetupState;
  /** Object storage; null only when S3 is not configured (tests and dev without storage). */
  storage: Storage | null;
  /** Direct TCP peer address of the request (overridable in tests). */
  peerIp(c: AppContext): string | undefined;
  /** Readiness probes beyond the database (storage, queue), added by later modules. */
  readinessChecks: Array<{ name: string; check(): Promise<void> }>;
}
