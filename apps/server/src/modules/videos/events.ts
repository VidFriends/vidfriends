import type { DbOrTx } from '../../infra/db.js';

/**
 * Hooks fired inside the transaction that makes a video playable (`ready` or `link_only`), so
 * the shares module can deliver pending shares and notify recipients (LLD §4 "finalize shares")
 * without the videos module importing it.
 */
export const videoEvents: { becamePlayable: ((tx: DbOrTx, videoId: string) => Promise<void>)[] } = {
  becamePlayable: [],
};

export async function emitBecamePlayable(tx: DbOrTx, videoId: string): Promise<void> {
  for (const hook of videoEvents.becamePlayable) await hook(tx, videoId);
}
