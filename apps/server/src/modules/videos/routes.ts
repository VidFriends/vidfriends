import {
  addVideo,
  completeUpload,
  createUpload,
  getVideo,
  getVideoMedia,
} from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import { toVideo } from './serialize.js';
import * as videos from './service.js';

export const videoHandlers = [
  handler(addVideo, async ({ deps, viewer, body }) => videos.addLink(deps, viewer, body.url)),
  handler(createUpload, async ({ deps, viewer, body }) =>
    videos.createUpload(deps, viewer, body.bytes, body.content_type),
  ),
  handler(completeUpload, async ({ deps, viewer, params, body }) =>
    videos.completeUpload(deps, viewer, params.id, body),
  ),
  handler(getVideo, async ({ deps, viewer, params }) => ({
    video: toVideo(await videos.visibleVideo(deps, viewer, params.id)),
  })),
  handler(getVideoMedia, async ({ deps, viewer, params }) =>
    videos.mediaUrls(deps, await videos.visibleVideo(deps, viewer, params.id)),
  ),
];
