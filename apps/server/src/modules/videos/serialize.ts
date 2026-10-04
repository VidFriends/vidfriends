import type { Video } from '@vidfriends/contracts';
import type { videos } from '../../db/schema.js';

export type VideoRow = typeof videos.$inferSelect;

export function toVideo(v: VideoRow): Video {
  return {
    id: v.id,
    state: v.state,
    source_kind: v.sourceKind,
    source_url: v.sourceKind === 'link' ? (v.normalizedUrl ?? v.sourceUrl) : null,
    platform: v.platform,
    title: v.title,
    author_handle: v.authorHandle,
    duration_ms: v.durationMs,
    width: v.width,
    height: v.height,
    has_thumbnail: Boolean(v.thumbKey),
    media_bytes: v.state === 'ready' && v.mediaBytes > 0 ? v.mediaBytes : null,
    failure_reason: v.failureReason,
    created_at: v.createdAt.toISOString(),
    ready_at: v.readyAt?.toISOString() ?? null,
  };
}
