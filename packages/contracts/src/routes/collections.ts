import { z } from 'zod';
import { Id, PageQuery, page } from '../common.js';
import { defineRoute } from '../route.js';
import { ReceivedShare } from './shares.js';

/** BR-COL-1: names, and how many collections and items a member may keep. */
export const CollectionName = z.string().trim().min(1).max(60);
export const MAX_COLLECTIONS = 50;
export const MAX_COLLECTION_ITEMS = 500;

export const Collection = z.object({
  id: Id,
  name: z.string(),
  /** Shares the member can currently see (BR-COL-3). */
  item_count: z.number().int(),
  /** With `?share_id=`: whether that share is in this collection; otherwise null. */
  contains: z.boolean().nullable(),
});
export type Collection = z.infer<typeof Collection>;

const CollectionId = z.object({ id: Id });
const ItemParams = z.object({ id: Id, share_id: Id });

export const listCollections = defineRoute({
  id: 'listCollections',
  method: 'get',
  path: '/collections',
  auth: 'member',
  tag: 'feed',
  summary: 'My collections, by name; with share_id, which of them hold that share (FR-FEED-07)',
  query: z.object({ share_id: Id.optional() }),
  status: 200,
  response: z.object({ items: z.array(Collection) }),
});

export const createCollection = defineRoute({
  id: 'createCollection',
  method: 'post',
  path: '/collections',
  auth: 'member',
  tag: 'feed',
  summary: 'Create a collection, optionally with a first received share in it (BR-COL-1/2)',
  body: z.object({ name: CollectionName, share_id: Id.optional() }),
  status: 201,
  response: z.object({ collection: Collection }),
  errors: ['validation_failed', 'too_many_collections', 'collection_name_taken', 'not_found'],
});

export const getCollection = defineRoute({
  id: 'getCollection',
  method: 'get',
  path: '/collections/{id}',
  auth: 'member',
  tag: 'feed',
  summary: 'One of my collections and its shares, newest added first (BR-COL-3)',
  params: CollectionId,
  query: PageQuery,
  status: 200,
  response: page(ReceivedShare).extend({ collection: Collection }),
  errors: ['not_found'],
});

export const updateCollection = defineRoute({
  id: 'updateCollection',
  method: 'patch',
  path: '/collections/{id}',
  auth: 'member',
  tag: 'feed',
  summary: 'Rename one of my collections',
  params: CollectionId,
  body: z.object({ name: CollectionName }),
  status: 200,
  response: z.object({ collection: Collection }),
  errors: ['not_found', 'validation_failed', 'collection_name_taken'],
});

export const deleteCollection = defineRoute({
  id: 'deleteCollection',
  method: 'delete',
  path: '/collections/{id}',
  auth: 'member',
  tag: 'feed',
  summary: 'Delete one of my collections; its shares stay saved (BR-COL-2)',
  params: CollectionId,
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const addToCollection = defineRoute({
  id: 'addToCollection',
  method: 'put',
  path: '/collections/{id}/items/{share_id}',
  auth: 'member',
  tag: 'feed',
  summary: 'Put a share I received into a collection; this also saves it (BR-COL-2)',
  params: ItemParams,
  status: 200,
  response: z.object({ collection: Collection }),
  errors: ['not_found', 'collection_full'],
});

export const removeFromCollection = defineRoute({
  id: 'removeFromCollection',
  method: 'delete',
  path: '/collections/{id}/items/{share_id}',
  auth: 'member',
  tag: 'feed',
  summary: 'Take a share out of a collection; it stays saved (BR-COL-2)',
  params: ItemParams,
  status: 200,
  response: z.object({ collection: Collection }),
  errors: ['not_found'],
});
