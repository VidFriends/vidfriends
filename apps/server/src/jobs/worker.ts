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
import { JOB_PURGE_ACCOUNT_MEDIA, JOB_RETENTION } from '../modules/admin/service.js';
import { buildExport, JOB_EXPORT } from '../modules/exports/service.js';
import {
  JOB_CLEANUP,
  JOB_SWEEP,
  runAccountPurge,
  runCleanup,
  runRetention,
  runSweep,
} from './maintenance.js';

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
  { name: JOB_RETENTION, retryLimit: 1, expireInSeconds: 3600 },
  { name: JOB_SWEEP, retryLimit: 1, expireInSeconds: 3600 },
  { name: JOB_CLEANUP, retryLimit: 1, expireInSeconds: 900 },
  {
    name: JOB_PURGE_ACCOUNT_MEDIA,
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 900,
  },
  // Failures are recorded on the export row; members can request again (WF-ACCT-4).
  { name: JOB_EXPORT, retryLimit: 0, expireInSeconds: 3600 },
];

/** Cron schedules (UTC): retention daily 03:30, sweeper weekly, housekeeping hourly (SDD §4). */
export const SCHEDULES: [string, string][] = [
  [JOB_RETENTION, '30 3 * * *'],
  [JOB_SWEEP, '15 4 * * 0'],
  [JOB_CLEANUP, '7 * * * *'],
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
  // Singleton maintenance jobs (concurrency 1).
  await queue.work(JOB_RETENTION, 1, async () => void (await runRetention(deps)));
  await queue.work(JOB_SWEEP, 1, async () => void (await runSweep(deps)));
  await queue.work(JOB_CLEANUP, 1, async () => void (await runCleanup(deps)));
  await queue.work<{ video_ids: string[]; keys: string[] }>(JOB_PURGE_ACCOUNT_MEDIA, 1, (job) =>
    runAccountPurge(deps, job),
  );
  await queue.work<{ export_id: string }>(JOB_EXPORT, 1, (job) => buildExport(deps, job));
  for (const [name, cron] of SCHEDULES) await queue.boss.schedule(name, cron, {}, { tz: 'UTC' });
  deps.log.info('worker started');
  return {
    async stop() {
      await queue.boss.offWork(JOB_FETCH, { wait: true }).catch(() => {});
      await queue.boss.offWork(JOB_PROCESS, { wait: true }).catch(() => {});
      for (const name of [
        JOB_NOTIFY,
        JOB_RETENTION,
        JOB_SWEEP,
        JOB_CLEANUP,
        JOB_PURGE_ACCOUNT_MEDIA,
        JOB_EXPORT,
      ]) {
        await queue.boss.offWork(name, { wait: true }).catch(() => {});
      }
      deps.log.info('worker stopped');
    },
  };
}
