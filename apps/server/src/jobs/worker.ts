// Background worker (C-WRK, SDD §4). Registers every job handler with bounded concurrency.
import type { Deps } from '../http/deps.js';
import {
  handleFetch,
  handleProcess,
  PROCESS_RETRY_LIMIT,
  type FetchJob,
  type ProcessJob,
} from './videos.js';
import { JOB_FETCH, JOB_PROCESS } from '../modules/videos/service.js';
import type { QueueDefinition } from '../infra/queue.js';

export interface Worker {
  stop(): Promise<void>;
}

/** Queue definitions shared by API (enqueue) and worker (process). */
export const QUEUES: QueueDefinition[] = [
  // Retries for fetch are scheduled by the job itself (exact FRD delays), so pg-boss does not retry.
  { name: JOB_FETCH, retryLimit: 0, expireInSeconds: 3600 },
  {
    name: JOB_PROCESS,
    retryLimit: PROCESS_RETRY_LIMIT,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 7200,
  },
];

export async function startWorker(deps: Deps): Promise<Worker> {
  const queue = deps.queue;
  if (!queue) throw new Error('worker needs the job queue');
  if (!deps.storage) throw new Error('worker needs object storage (S3_* settings)');
  await queue.work<FetchJob>(JOB_FETCH, deps.env.WORKER_FETCH_CONCURRENCY, (job) =>
    handleFetch(deps, job),
  );
  await queue.work<ProcessJob>(JOB_PROCESS, deps.env.WORKER_PROCESS_CONCURRENCY, (job) =>
    handleProcess(deps, job),
  );
  deps.log.info('worker started');
  return {
    async stop() {
      await queue.boss.offWork(JOB_FETCH, { wait: true }).catch(() => {});
      await queue.boss.offWork(JOB_PROCESS, { wait: true }).catch(() => {});
      deps.log.info('worker stopped');
    },
  };
}
