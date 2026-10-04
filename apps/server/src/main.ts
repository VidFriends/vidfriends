// Entrypoint: `node dist/main.js [migrate]`. ROLE selects api | worker | all (SDD §1).
import { serve } from '@hono/node-server';
import { ConfigError, loadEnv } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import { allHandlers } from './http/handlers.js';
import { createDatabase } from './infra/db.js';
import { createLogger } from './infra/logger.js';
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

  const deps = buildDeps(env, log);
  const shutdownTasks: Array<() => Promise<void>> = [];

  if (env.ROLE === 'api' || env.ROLE === 'all') {
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
