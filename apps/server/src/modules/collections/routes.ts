import {
  addToCollection,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeFromCollection,
  updateCollection,
} from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import * as svc from './service.js';

export const collectionHandlers = [
  handler(listCollections, async ({ deps, viewer, query }) => ({
    items: await svc.listCollections(deps, viewer, query.share_id),
  })),
  handler(createCollection, async ({ deps, viewer, body }) => ({
    collection: await svc.createCollection(deps, viewer, body),
  })),
  handler(getCollection, async ({ deps, viewer, params, query }) =>
    svc.collectionPage(deps, viewer, params.id, query.cursor, query.limit),
  ),
  handler(updateCollection, async ({ deps, viewer, params, body }) => ({
    collection: await svc.renameCollection(deps, viewer, params.id, body.name),
  })),
  handler(deleteCollection, async ({ deps, viewer, params }) => {
    await svc.deleteCollection(deps, viewer, params.id);
  }),
  handler(addToCollection, async ({ deps, viewer, params }) => ({
    collection: await svc.addItem(deps, viewer, params.id, params.share_id),
  })),
  handler(removeFromCollection, async ({ deps, viewer, params }) => ({
    collection: await svc.removeItem(deps, viewer, params.id, params.share_id),
  })),
];
