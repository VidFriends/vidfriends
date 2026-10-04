import {
  clearReaction,
  deleteReply,
  getFeed,
  getHistory,
  getInbox,
  getSaved,
  getSent,
  getShare,
  getShareMedia,
  listReplies,
  postReply,
  reportProgress,
  sendShares,
  setReaction,
  unsendShare,
  updateShare,
} from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import * as svc from './service.js';

export const shareHandlers = [
  handler(sendShares, async ({ deps, viewer, body }) =>
    svc.send(deps, viewer, {
      videoId: body.video_id,
      recipientIds: body.recipient_ids,
      note: body.note ?? '',
      idempotencyKey: body.idempotency_key,
    }),
  ),
  handler(unsendShare, async ({ deps, viewer, params }) => {
    await svc.unsend(deps, viewer, params.id);
  }),
  handler(getShare, async ({ deps, viewer, params }) => ({
    share: await svc.getDetail(deps, viewer, params.id),
  })),
  handler(getShareMedia, async ({ deps, viewer, params }) =>
    svc.shareMedia(deps, viewer, params.id),
  ),
  handler(reportProgress, async ({ deps, viewer, params, body }) =>
    svc.progress(deps, viewer, params.id, body),
  ),
  handler(updateShare, async ({ deps, viewer, params, body }) => ({
    share: await svc.updateRecipientState(deps, viewer, params.id, body),
  })),
  handler(setReaction, async ({ deps, viewer, params, body }) => ({
    share: await svc.setReaction(deps, viewer, params.id, body.emoji),
  })),
  handler(clearReaction, async ({ deps, viewer, params }) => ({
    share: await svc.setReaction(deps, viewer, params.id, null),
  })),
  handler(listReplies, async ({ deps, viewer, params, query }) =>
    svc.listReplies(deps, viewer, params.id, query.cursor, query.limit),
  ),
  handler(postReply, async ({ deps, viewer, params, body }) =>
    svc.postReply(deps, viewer, params.id, body.body),
  ),
  handler(deleteReply, async ({ deps, viewer, params }) => {
    await svc.deleteReply(deps, viewer, params.id);
  }),
  handler(getFeed, async ({ deps, viewer, query }) =>
    svc.feed(deps, viewer, query.cursor, query.limit),
  ),
  handler(getInbox, async ({ deps, viewer, query }) =>
    svc.inbox(deps, viewer, query.cursor, query.limit),
  ),
  handler(getSaved, async ({ deps, viewer, query }) =>
    svc.saved(deps, viewer, query.cursor, query.limit),
  ),
  handler(getHistory, async ({ deps, viewer, query }) =>
    svc.history(deps, viewer, { sender: query.sender, q: query.q }, query.cursor, query.limit),
  ),
  handler(getSent, async ({ deps, viewer, query }) =>
    svc.sent(deps, viewer, query.cursor, query.limit),
  ),
];
