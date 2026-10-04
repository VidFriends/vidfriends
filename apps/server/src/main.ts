// Entrypoint: `node dist/main.js [migrate | recovery-link <username>]`. ROLE selects api | worker | all (SDD §1).
import { serve } from '@hono/node-server';
import { ConfigError, loadEnv } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import { allHandlers } from './http/handlers.js';
import { createDatabase } from './infra/db.js';
import { createLogger } from './infra/logger.js';
import { createQueue } from './infra/queue.js';
import { registerGauge, startMetricsServer } from './infra/metrics.js';
import { eq, sql } from 'drizzle-orm';
import { users } from './db/schema.js';
import { createRecoveryLink } from './modules/auth/service.js';
import { QUEUES } from './jobs/worker.js';
import { buildDeps, initSetupToken } from './bootstrap.js';
import { SERVER_VERSION } from './version.js';

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(78); // EX_CONFIG
    }
    throw err;
  }
  const log = createLogger(env.LOG_LEVEL);

  if (process.argv[2] === 'migrate') {
    const database = createDatabase(env.DATABASE_URL, 1);
    await runMigrations(database);
    await database.close();
    log.info('migrations applied');
    return;
  }

  if (process.argv[2] === 'recovery-link') {
    // FR-ADM-03: the operator recovers any member, including a locked-out admin. The link goes
    // to the terminal only, never to the log.
    const username = (process.argv[3] ?? '').trim().toLowerCase();
    const deps = buildDeps(env, log);
    try {
      const [user] = await deps.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (!user) {
        process.stderr.write(`No member named "${username}".\n`);
        process.exitCode = 1;
        return;
      }
      const link = await createRecoveryLink(deps, { userId: user.id, actorId: null, ip: null });
      process.stdout.write(
        `Recovery link for ${username} (single use, valid until ${link.expires_at}):\n${link.url}\n`,
      );
    } finally {
      await deps.database.close();
    }
    return;
  }

  const deps = buildDeps(env, log);
  const shutdownTasks: Array<() => Promise<void>> = [];

  if (deps.storage) {
    // Creates the bucket on first start (replaces a separate init container, ADR-0015).
    await deps.storage.ensureBucket().catch((err: unknown) => {
      log.error({ err }, 'object storage is not reachable; /readyz will report it');
    });
  } else if (env.NODE_ENV !== 'test') {
    log.warn('S3 storage is not configured; media features are unavailable');
  }

  if (env.METRICS_PORT > 0) {
    const metricsServer = startMetricsServer(env.METRICS_PORT);
    registerGauge(
      'vidfriends_storage_bytes',
      'Bytes of stored media attributed to members',
      async () => {
        const r = await deps.db.execute<{ n: string }>(
          sql`select coalesce(sum(storage_bytes), 0) as n from users`,
        );
        return Number(r.rows[0]?.n ?? 0);
      },
    );
    registerGauge('vidfriends_realtime_streams', 'Open realtime event streams', async () =>
      Promise.resolve(deps.realtime?.total() ?? 0),
    );
    registerGauge(
      'vidfriends_queue_depth',
      'Queued jobs by queue',
      async () => {
        const r = await deps.db.execute<{ name: string; n: number }>(
          sql`select name, count(*)::int as n from pgboss.job where state in ('created', 'retry') group by name`,
        );
        return Object.fromEntries(r.rows.map((row) => [row.name, row.n]));
      },
      'queue',
    );
    shutdownTasks.push(() => new Promise<void>((resolve) => metricsServer.close(() => resolve())));
  }

  // Both roles enqueue jobs; only the worker role processes them (SDD §4).
  deps.queue = await createQueue(env.DATABASE_URL, QUEUES, log, {
    supervise: env.ROLE !== 'api',
    schedule: env.ROLE !== 'api',
  });

  if (env.ROLE === 'api' || env.ROLE === 'all') {
    // ADR-0019: one LISTEN connection per API process fans events out to open streams.
    const { createRealtimeHub } = await import('./infra/realtime.js');
    const hub = createRealtimeHub(env.DATABASE_URL, log);
    await hub.start();
    deps.realtime = hub;
    shutdownTasks.push(() => hub.stop());
    await initSetupToken(deps);
    const app = createApp(deps, allHandlers());
    const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT });
    log.info({ port: env.PORT, role: env.ROLE, version: SERVER_VERSION }, 'api listening');
    shutdownTasks.push(
      () =>
        new Promise<void>((resolve) => {
          // Stop accepting connections; in-flight requests finish (NFR-REL-02).
          server.close(() => resolve());
          if ('closeIdleConnections' in server) server.closeIdleConnections();
        }),
    );
  }
  if (env.ROLE === 'worker' || env.ROLE === 'all') {
    const { startWorker } = await import('./jobs/worker.js');
    const worker = await startWorker(deps);
    shutdownTasks.push(() => worker.stop());
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      log.warn('graceful shutdown timed out');
      process.exit(1);
    }, env.SHUTDOWN_GRACE_SECONDS * 1000);
    timer.unref();
    await Promise.allSettled(shutdownTasks.map((t) => t()));
    await deps.queue?.stop().catch(() => {});
    await deps.database.close();
    log.info('stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
