import type { QueryClient } from '@tanstack/react-query';
import { getCollection, getSaved, getShare, listCollections } from '@vidfriends/contracts';

/** Collection changes also change Saved and the share's saved flag (BR-COL-2). */
export function refreshCollections(queryClient: QueryClient) {
  return Promise.all(
    [listCollections, getCollection, getSaved, getShare].map((r) =>
      queryClient.invalidateQueries({ queryKey: [r.id] }),
    ),
  );
}
