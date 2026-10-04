// Durable jobs on PostgreSQL via pg-boss (ADR-0007, SDD §4, NFR-REL-01).
// Jobs are enqueued in the same transaction as the state change that causes them (transactional
// outbox), so a rolled-back change never leaves a job behind and a committed one never loses it.
import { PgBoss, type Job, type SendOptions } from 'pg-boss';
import type { DbOrTx } from './db.js';
import type { Logger } from './logger.js';

export interface QueueDefinition {
  name: string;
  /** Total attempts are handled by the job itself where FRD timings require it. */
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
}

export interface JobQueue {
  boss: PgBoss;
  send(name: string, data: object, options?: SendOptions & { tx?: DbOrTx }): Promise<string | null>;
  work<T extends object>(
    name: string,
    concurrency: number,
    handler: (job: Job<T>) => Promise<void>,
  ): Promise<void>;
  stop(): Promise<void>;
}

/** The pg client behind a Drizzle transaction (node-postgres driver). */
function pgClientOf(tx: DbOrTx): { query(text: string, values?: unknown[]): Promise<unknown> } {
  const session = (tx as unknown as { session?: { client?: unknown } }).session;
  const client = session?.client as { query?: unknown } | undefined;
  if (!client || typeof client.query !== 'function')
    throw new Error('cannot reach the pg client of this transaction');
  return client as { query(text: string, values?: unknown[]): Promise<unknown> };
}

export async function createQueue(
  connectionString: string,
  definitions: QueueDefinition[],
  log: Logger,
  options: { supervise?: boolean; schedule?: boolean } = {},
): Promise<JobQueue> {
  const boss = new PgBoss({
    connectionString,
    max: 4,
    supervise: options.supervise ?? true,
    schedule: options.schedule ?? true,
    application_name: 'vidfriends-jobs',
  });
  boss.on('error', (err: unknown) => log.error({ err }, 'job queue error'));
  await boss.start();
  for (const def of definitions) {
    const { name, ...rest } = def;
    await boss.createQueue(name, { retryLimit: 0, ...rest }).catch(async () => {
      await boss.updateQueue(name, { retryLimit: 0, ...rest });
    });
  }
  return {
    boss,
    async send(name, data, opts = {}) {
      const { tx, ...sendOptions } = opts;
      if (tx) {
        const client = pgClientOf(tx);
        return boss.send(name, data, {
          ...sendOptions,
          db: {
            executeSql: (text: string, values?: unknown[]) => client.query(text, values) as never,
          },
        });
      }
      return boss.send(name, data, sendOptions);
    },
    async work<T extends object>(
      name: string,
      concurrency: number,
      handler: (job: Job<T>) => Promise<void>,
    ) {
      await boss.work<T>(
        name,
        { localConcurrency: concurrency, batchSize: 1, pollingIntervalSeconds: 1 },
        async (jobs) => {
          for (const job of jobs) await handler(job);
        },
      );
    },
    async stop() {
      // Graceful: in-flight handlers finish (or their lease is released) before the pool closes.
      await boss.stop({ graceful: true, timeout: 20_000 });
    },
  };
}
