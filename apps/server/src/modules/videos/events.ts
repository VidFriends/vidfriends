import type { DbOrTx } from '../../infra/db.js';
import type { Deps } from '../../http/deps.js';

/**
 * Hook fired inside the transaction that makes a video playable (`ready` or `link_only`), so
 * the shares module can deliver pending shares and notify recipients (LLD §4 "finalize shares")
 * without the videos module importing it. Assigned once by `modules/hooks.ts`.
 */
export const videoEvents: {
  becamePlayable: ((deps: Deps, tx: DbOrTx, videoId: string) => Promise<void>) | null;
} = { becamePlayable: null };

export async function emitBecamePlayable(deps: Deps, tx: DbOrTx, videoId: string): Promise<void> {
  await videoEvents.becamePlayable?.(deps, tx, videoId);
}
