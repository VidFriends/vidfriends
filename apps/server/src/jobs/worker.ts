// Background worker (C-WRK). Job handlers are registered here as milestones add them (SDD §4).
import type { Deps } from '../http/deps.js';

export interface Worker {
  stop(): Promise<void>;
}

export async function startWorker(deps: Deps): Promise<Worker> {
  deps.log.info('worker started');
  return {
    async stop() {
      deps.log.info('worker stopped');
    },
  };
}
