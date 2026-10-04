import type { BlockList } from 'node:net';
import type { Env } from '../config/env.js';
import type { Clock } from '../infra/clock.js';
import type { Database, Db } from '../infra/db.js';
import type { Logger } from '../infra/logger.js';
import type { RateLimiter } from '../infra/rate-limit.js';
import type { RealtimeHub } from '../infra/realtime.js';
import type { JobQueue } from '../infra/queue.js';
import type { PushSender } from '../infra/push/channels.js';
import type { Storage } from '../infra/storage.js';
import type { FetchLike, Lookup } from '../modules/videos/url.js';
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
  /** Realtime fan-out to open event streams (ADR-0019); null outside the API role. */
  realtime: RealtimeHub | null;
  /** Durable job queue (pg-boss); null until started, so enqueueing fails loudly. */
  queue: JobQueue | null;
  /** Push channels by target kind, resolved lazily (VAPID keys live in the database). */
  pushSenders(): Promise<Partial<Record<'webpush' | 'expo', PushSender>>>;
  /** Outbound network primitives used by link handling (injectable for tests). */
  net: { lookup: Lookup; fetch: FetchLike };
  /** Direct TCP peer address of the request (overridable in tests). */
  peerIp(c: AppContext): string | undefined;
  /** Readiness probes beyond the database (storage, queue), added by later modules. */
  readinessChecks: Array<{ name: string; check(): Promise<void> }>;
}
