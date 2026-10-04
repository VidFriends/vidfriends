// M3-T1 / NFR-REL-01: a job survives a worker crash and completes exactly once after restart.
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from './support/app.js';
import { waitFor } from './support/wait.js';

let server: TestServer;
beforeAll(async () => {
  server = await createTestServer();
  await server.deps.db.execute(
    sql`create table job_effects (key text primary key, runs int not null default 1)`,
  );
});
afterAll(async () => server.close());

const QUEUE = 'test.restart';

describe('job runtime', () => {
  it('re-runs a job whose worker died and applies its effect exactly once', async () => {
    const url = server.env.DATABASE_URL;
    await server.deps.queue!.boss.createQueue(QUEUE, { retryLimit: 3, expireInSeconds: 2 });
    const id = await server.deps.queue!.send(QUEUE, { key: 'k1' });

    // Worker A claims the job and "crashes" before finishing it.
    const a = new PgBoss({ connectionString: url, supervise: false, schedule: false });
    await a.start();
    let claimed = false;
    await a.work(QUEUE, { pollingIntervalSeconds: 0.5 }, async () => {
      claimed = true;
      await new Promise(() => {}); // never finishes
    });
    await waitFor(async () => claimed, 10_000, 'worker A to claim');
    await a.stop({ graceful: false, close: true, timeout: 1000 }).catch(() => {});

    // Worker B (with supervision) expires A's lease, retries the job and completes it.
    const b = new PgBoss({
      connectionString: url,
      supervise: true,
      superviseIntervalSeconds: 1,
      schedule: false,
    });
    await b.start();
    await b.work<{ key: string }>(QUEUE, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
      // Idempotent effect: a second run would only bump `runs`, which the assertion would catch.
      await server.deps.db.execute(
        sql`insert into job_effects (key) values (${job!.data.key}) on conflict (key) do update set runs = job_effects.runs + 1`,
      );
    });
    const job = await waitFor(
      async () => {
        const found = await b.getJobById(QUEUE, id as string);
        return found?.state === 'completed' ? found : null;
      },
      30_000,
      'job completion',
    );
    await b.stop({ graceful: true, close: true });
    expect(job.retryCount).toBeGreaterThanOrEqual(1);
    const rows = await server.deps.db.execute(sql`select runs from job_effects where key = 'k1'`);
    expect(rows.rows).toEqual([{ runs: 1 }]);
  });

  it('enqueues in the caller transaction: a rollback leaves no job (transactional outbox)', async () => {
    await server.deps.queue!.boss.createQueue('test.outbox', {});
    await server.deps.db
      .transaction(async (tx) => {
        await server.deps.queue!.send('test.outbox', { n: 1 }, { tx });
        throw new Error('rollback');
      })
      .catch(() => {});
    await server.deps.db.transaction(async (tx) => {
      await server.deps.queue!.send('test.outbox', { n: 2 }, { tx });
    });
    const jobs = await server.deps.queue!.boss.findJobs('test.outbox', {});
    expect(jobs.map((j) => (j.data as { n: number }).n)).toEqual([2]);
  });
});
