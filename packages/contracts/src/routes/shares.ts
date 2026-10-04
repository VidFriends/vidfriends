import { z } from 'zod';
import { Id, PageQuery, Timestamp, page } from '../common.js';
import { defineRoute } from '../route.js';
import { PublicUser } from './accounts.js';
import { MediaUrls, Video } from './videos.js';

/** BR-ENG-2: the fixed reaction set. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;
export const Reaction = z.enum(REACTIONS);
export type Reaction = z.infer<typeof Reaction>;

export const Note = z.string().trim().max(500);

export const LastReply = z.object({
  author_id: Id,
  /** Null when the reply was deleted (placeholder, BR-ENG-3). */
  body: z.string().nullable(),
  created_at: Timestamp,
});

/** A received share as the recipient sees it (BR-SHR-2). */
export const ReceivedShare = z.object({
  id: Id,
  video: Video,
  sender: PublicUser,
  note: z.string(),
  delivered_at: Timestamp,
  watched_at: Timestamp.nullable(),
  progress_ms: z.number().int(),
  saved: z.boolean(),
  hidden: z.boolean(),
  reaction: Reaction.nullable(),
  reply_count: z.number().int(),
  created_at: Timestamp,
});
export type ReceivedShare = z.infer<typeof ReceivedShare>;

/** Feed item: one per video, with other senders of the same video (BR-FEED-1, BR-FEED-7). */
export const FeedItem = ReceivedShare.extend({
  section: z.enum(['unwatched', 'watched']),
  also_sent_by: z.array(PublicUser),
});
export type FeedItem = z.infer<typeof FeedItem>;

/** A sent share as the sender sees it: never `saved` or `hidden` (BR-SHR-4). */
export const SentShare = z.object({
  id: Id,
  video: Video,
  recipient: PublicUser,
  note: z.string(),
  status: z.enum(['processing', 'delivered', 'watched']),
  watched_at: Timestamp.nullable(),
  reaction: Reaction.nullable(),
  reply_count: z.number().int(),
  last_reply: LastReply.nullable(),
  created_at: Timestamp,
});
export type SentShare = z.infer<typeof SentShare>;

export const ShareDetail = z.object({
  id: Id,
  role: z.enum(['sender', 'recipient']),
  video: Video,
  sender: PublicUser,
  recipient: PublicUser,
  note: z.string(),
  delivered_at: Timestamp.nullable(),
  watched_at: Timestamp.nullable(),
  progress_ms: z.number().int().nullable(),
  /** Recipient-only state; null for the sender (BR-SHR-4). */
  saved: z.boolean().nullable(),
  hidden: z.boolean().nullable(),
  reaction: Reaction.nullable(),
  reply_count: z.number().int(),
  created_at: Timestamp,
});
export type ShareDetail = z.infer<typeof ShareDetail>;

export const Reply = z.object({
  id: Id,
  share_id: Id,
  author: PublicUser,
  /** Null when deleted: shown as "reply deleted" (BR-ENG-3). */
  body: z.string().nullable(),
  deleted: z.boolean(),
  created_at: Timestamp,
});
export type Reply = z.infer<typeof Reply>;

const ShareId = z.object({ id: Id });

export const sendShares = defineRoute({
  id: 'sendShares',
  method: 'post',
  path: '/shares',
  auth: 'member',
  tag: 'shares',
  summary: 'Send a video to friends; idempotent, per-recipient results (FR-SHR-01/02, WF-SHR-1)',
  body: z.object({
    video_id: Id,
    recipient_ids: z.array(Id).min(1).max(20),
    note: Note.optional(),
    idempotency_key: z.string().min(8).max(100),
  }),
  status: 200,
  response: z.object({
    results: z.array(
      z.object({
        recipient_id: Id,
        status: z.enum(['sent', 'already_sent', 'not_allowed']),
        share_id: Id.nullable(),
      }),
    ),
  }),
  errors: ['video_not_found'],
});

export const unsendShare = defineRoute({
  id: 'unsendShare',
  method: 'delete',
  path: '/shares/{id}',
  auth: 'member',
  tag: 'shares',
  summary: 'Unsend while unwatched (FR-SHR-04, WF-SHR-2)',
  params: ShareId,
  status: 204,
  response: null,
  errors: ['not_found', 'already_watched'],
});

export const getShare = defineRoute({
  id: 'getShare',
  method: 'get',
  path: '/shares/{id}',
  auth: 'member',
  tag: 'shares',
  summary:
    'A share the viewer sent or received; reading it marks its notifications read (BR-NOT-5)',
  params: ShareId,
  status: 200,
  response: z.object({ share: ShareDetail }),
  errors: ['not_found'],
});

export const getShareMedia = defineRoute({
  id: 'getShareMedia',
  method: 'get',
  path: '/shares/{id}/media',
  auth: 'member',
  tag: 'shares',
  summary: 'Short-lived signed media/thumbnail URLs for a share participant (FR-VID-05)',
  params: ShareId,
  status: 200,
  response: MediaUrls,
  errors: ['not_found', 'not_playable'],
});

export const reportProgress = defineRoute({
  id: 'reportProgress',
  method: 'post',
  path: '/shares/{id}/progress',
  auth: 'member',
  tag: 'shares',
  summary: 'Playback progress; sets watched at ≥ 50% or ≥ 10 s, or on "Open original" (FR-FEED-03)',
  params: ShareId,
  body: z.object({
    position_ms: z
      .number()
      .int()
      .min(0)
      .max(24 * 3600 * 1000),
    duration_ms: z
      .number()
      .int()
      .min(0)
      .max(24 * 3600 * 1000)
      .optional(),
    opened_original: z.boolean().optional(),
  }),
  status: 200,
  response: z.object({ watched_at: Timestamp.nullable(), progress_ms: z.number().int() }),
  errors: ['not_found'],
});

export const updateShare = defineRoute({
  id: 'updateShare',
  method: 'patch',
  path: '/shares/{id}',
  auth: 'member',
  tag: 'shares',
  summary: 'Save, unsave, hide or unhide a received share (FR-FEED-04)',
  params: ShareId,
  body: z.object({ saved: z.boolean().optional(), hidden: z.boolean().optional() }),
  status: 200,
  response: z.object({ share: ShareDetail }),
  errors: ['not_found'],
});

export const setReaction = defineRoute({
  id: 'setReaction',
  method: 'put',
  path: '/shares/{id}/reaction',
  auth: 'member',
  tag: 'engagement',
  summary: 'Set or replace the recipient reaction (FR-ENG-01)',
  params: ShareId,
  body: z.object({ emoji: z.string().max(16) }),
  status: 200,
  response: z.object({ share: ShareDetail }),
  errors: ['not_found', 'invalid_reaction'],
});

export const clearReaction = defineRoute({
  id: 'clearReaction',
  method: 'delete',
  path: '/shares/{id}/reaction',
  auth: 'member',
  tag: 'engagement',
  summary: 'Clear the recipient reaction (FR-ENG-01)',
  params: ShareId,
  status: 200,
  response: z.object({ share: ShareDetail }),
  errors: ['not_found'],
});

export const listReplies = defineRoute({
  id: 'listReplies',
  method: 'get',
  path: '/shares/{id}/replies',
  auth: 'member',
  tag: 'engagement',
  summary: 'The private conversation of a share, oldest first (FR-ENG-02)',
  params: ShareId,
  query: PageQuery,
  status: 200,
  response: page(Reply),
  errors: ['not_found'],
});

export const postReply = defineRoute({
  id: 'postReply',
  method: 'post',
  path: '/shares/{id}/replies',
  auth: 'member',
  tag: 'engagement',
  summary: 'Reply in the conversation; 60 per 10 min (FR-ENG-02, BR-ENG-3/4)',
  params: ShareId,
  body: z.object({ body: z.string().trim().min(1).max(1000) }),
  status: 201,
  response: z.object({ reply: Reply }),
  errors: ['not_found', 'rate_limited'],
});

export const deleteReply = defineRoute({
  id: 'deleteReply',
  method: 'delete',
  path: '/replies/{id}',
  auth: 'member',
  tag: 'engagement',
  summary: 'Delete own reply, leaving a placeholder (BR-ENG-3)',
  params: z.object({ id: Id }),
  status: 204,
  response: null,
  errors: ['not_found'],
});

export const getFeed = defineRoute({
  id: 'getFeed',
  method: 'get',
  path: '/feed',
  auth: 'member',
  tag: 'feed',
  summary: 'Unwatched first (oldest first), then recently watched (FR-FEED-01, BR-FEED-1/7)',
  query: PageQuery,
  status: 200,
  response: page(FeedItem),
});

export const getInbox = defineRoute({
  id: 'getInbox',
  method: 'get',
  path: '/inbox',
  auth: 'member',
  tag: 'feed',
  summary: 'Unwatched, saved or watched in the last 48 h, newest first (BR-FEED-2)',
  query: PageQuery,
  status: 200,
  response: page(ReceivedShare),
});

export const getSaved = defineRoute({
  id: 'getSaved',
  method: 'get',
  path: '/saved',
  auth: 'member',
  tag: 'feed',
  summary: 'Saved shares, newest saved first (BR-FEED-3)',
  query: PageQuery,
  status: 200,
  response: page(ReceivedShare),
});

export const getHistory = defineRoute({
  id: 'getHistory',
  method: 'get',
  path: '/history',
  auth: 'member',
  tag: 'feed',
  summary: 'Watched shares, newest watched first; filter by sender and title (BR-FEED-4)',
  query: PageQuery.extend({
    sender: Id.optional(),
    q: z.string().trim().max(100).optional(),
  }),
  status: 200,
  response: page(ReceivedShare),
});

export const getSent = defineRoute({
  id: 'getSent',
  method: 'get',
  path: '/sent',
  auth: 'member',
  tag: 'feed',
  summary: 'Shares the viewer sent, newest first, with per-recipient state (FR-SHR-05, BR-SHR-4)',
  query: PageQuery,
  status: 200,
  response: page(SentShare),
});
