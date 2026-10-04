import { z } from 'zod';
import { Id, Timestamp } from '../common.js';
import { defineRoute } from '../route.js';

/** FRD §5 state machine. */
export const VideoState = z.enum([
  'queued',
  'fetching',
  'processing',
  'ready',
  'link_only',
  'failed',
  'expired',
]);
export type VideoState = z.infer<typeof VideoState>;

export const Video = z.object({
  id: Id,
  state: VideoState,
  source_kind: z.enum(['link', 'upload']),
  /** The original link, for "Open original" (null for uploads). */
  source_url: z.string().nullable(),
  platform: z.string().nullable(),
  title: z.string(),
  author_handle: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  has_thumbnail: z.boolean(),
  failure_reason: z.string().nullable(),
  created_at: Timestamp,
  ready_at: Timestamp.nullable(),
});
export type Video = z.infer<typeof Video>;

/** Video MIME types accepted for upload; the server sniffs the bytes regardless (NFR-SEC-08). */
export const UploadContentType = z.enum([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/3gpp',
  'video/x-m4v',
]);

/** Uploads above this size use S3 multipart (ADR-0009). */
export const MULTIPART_THRESHOLD_BYTES = 64 * 1024 * 1024;

export const addVideo = defineRoute({
  id: 'addVideo',
  method: 'post',
  path: '/videos',
  auth: 'member',
  tag: 'videos',
  summary: 'Add a video by link; fetched in the background (FR-VID-01/02, WF-VID-1)',
  body: z.object({ url: z.string().trim().min(1).max(2048) }),
  status: 201,
  altStatus: [200],
  response: z.object({ video: Video }),
  errors: ['url_not_allowed', 'quota_exceeded', 'storage_full'],
});

export const createUpload = defineRoute({
  id: 'createUpload',
  method: 'post',
  path: '/uploads',
  auth: 'member',
  tag: 'videos',
  summary: 'Reserve an upload; size and quota are checked before any bytes (FR-VID-03)',
  body: z.object({
    bytes: z.number().int().min(1),
    content_type: UploadContentType,
  }),
  status: 201,
  response: z.object({
    upload_id: Id,
    /** Single presigned PUT (files up to 64 MB). */
    put_url: z.string().nullable(),
    /** Presigned part URLs for larger files; PUT each part, keep each response's ETag. */
    multipart: z.object({ part_size: z.number().int(), part_urls: z.array(z.string()) }).nullable(),
    expires_at: Timestamp,
  }),
  errors: ['too_large', 'quota_exceeded', 'storage_full'],
});

export const completeUpload = defineRoute({
  id: 'completeUpload',
  method: 'post',
  path: '/uploads/{id}/complete',
  auth: 'member',
  tag: 'videos',
  summary: 'Finish an upload: sniff, hash, dedup and queue processing (WF-VID-2)',
  params: z.object({ id: Id }),
  body: z.object({
    title: z.string().trim().max(200).optional(),
    parts: z
      .array(z.object({ part_number: z.number().int().min(1), etag: z.string().max(200) }))
      .max(10000)
      .optional(),
  }),
  status: 201,
  altStatus: [200],
  response: z.object({ video: Video }),
  errors: ['upload_incomplete', 'not_found', 'too_large'],
});

export const getVideo = defineRoute({
  id: 'getVideo',
  method: 'get',
  path: '/videos/{id}',
  auth: 'member',
  tag: 'videos',
  summary: 'A video the viewer added or was sent (BR-SHR-6)',
  params: z.object({ id: Id }),
  status: 200,
  response: z.object({ video: Video }),
  errors: ['not_found'],
});

export const MediaUrls = z.object({
  media_url: z.string().nullable(),
  thumb_url: z.string().nullable(),
  expires_at: Timestamp,
});

export const getVideoMedia = defineRoute({
  id: 'getVideoMedia',
  method: 'get',
  path: '/videos/{id}/media',
  auth: 'member',
  tag: 'videos',
  summary: 'Short-lived signed media and thumbnail URLs for a video the viewer added (FR-VID-05)',
  params: z.object({ id: Id }),
  status: 200,
  response: MediaUrls,
  errors: ['not_found', 'not_playable'],
});
