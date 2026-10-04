// Collections (FR-FEED-07, BR-COL-1..3): shared helpers for the collection screens.
import type { QueryClient } from '@tanstack/react-query';
import { getCollection, getSaved, getShare, listCollections } from '@vidfriends/contracts';

/** Collection changes also change Saved and the share's saved flag (BR-COL-2). */
export function refreshCollections(qc: QueryClient) {
  return Promise.all(
    [listCollections, getCollection, getSaved, getShare].map((r) =>
      qc.invalidateQueries({ queryKey: [r.id] }),
    ),
  );
}
