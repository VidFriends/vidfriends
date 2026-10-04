// Background worker (C-WRK, SDD §4). Registers every job handler with bounded concurrency.
import '../modules/hooks.js';
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
import { handleNotify, type NotifyJob } from './notify.js';
import { JOB_NOTIFY } from '../modules/notifications/service.js';

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
  // Per-target push retries are scheduled by the job itself (only failed targets are retried).
  { name: JOB_NOTIFY, retryLimit: 2, retryDelay: 30, expireInSeconds: 300 },
];

export async function startWorker(deps: Deps): Promise<Worker> {
  const queue = deps.queue;
  if (!queue) throw new Error('worker needs the job queue');
  if (deps.storage) {
    await queue.work<FetchJob>(JOB_FETCH, deps.env.WORKER_FETCH_CONCURRENCY, (job) =>
      handleFetch(deps, job),
    );
    await queue.work<ProcessJob>(JOB_PROCESS, deps.env.WORKER_PROCESS_CONCURRENCY, (job) =>
      handleProcess(deps, job),
    );
  } else {
    deps.log.warn('object storage is not configured: media jobs are not running');
  }
  await queue.work<NotifyJob>(JOB_NOTIFY, 4, (job) => handleNotify(deps, job));
  deps.log.info('worker started');
  return {
    async stop() {
      await queue.boss.offWork(JOB_FETCH, { wait: true }).catch(() => {});
      await queue.boss.offWork(JOB_PROCESS, { wait: true }).catch(() => {});
      await queue.boss.offWork(JOB_NOTIFY, { wait: true }).catch(() => {});
      deps.log.info('worker stopped');
    },
  };
}
