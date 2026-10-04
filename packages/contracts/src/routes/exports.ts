import { z } from 'zod';
import { Id, Timestamp } from '../common.js';
import { defineRoute } from '../route.js';

/** A self-service data export (FR-ACCT-05, WF-ACCT-4). */
export const DataExport = z.object({
  id: Id,
  include_media: z.boolean(),
  state: z.enum(['queued', 'building', 'ready', 'failed', 'expired']),
  bytes: z.number().int().nullable(),
  error: z.string().nullable(),
  created_at: Timestamp,
  ready_at: Timestamp.nullable(),
  /** The download link works until then (7 days after the export is ready). */
  expires_at: Timestamp.nullable(),
});
export type DataExport = z.infer<typeof DataExport>;

export const createExport = defineRoute({
  id: 'createExport',
  method: 'post',
  path: '/me/exports',
  auth: 'member',
  tag: 'me',
  summary: 'Request an export of my data; built in the background (FR-ACCT-05, WF-ACCT-4)',
  body: z.object({ include_media: z.boolean().default(false) }),
  status: 202,
  response: z.object({ export: DataExport }),
  errors: ['export_in_progress', 'rate_limited'],
});

export const listExports = defineRoute({
  id: 'listExports',
  method: 'get',
  path: '/me/exports',
  auth: 'member',
  tag: 'me',
  summary: 'My data exports, newest first (FR-ACCT-05)',
  status: 200,
  response: z.object({ items: z.array(DataExport) }),
});

export const downloadExport = defineRoute({
  id: 'downloadExport',
  method: 'get',
  path: '/me/exports/{id}/download',
  auth: 'member',
  tag: 'me',
  summary: 'Redirect to a short-lived signed link for a ready export of mine (FR-ACCT-05)',
  params: z.object({ id: Id }),
  status: 302,
  response: null,
  errors: ['not_found'],
});

export const getExportUrl = defineRoute({
  id: 'getExportUrl',
  method: 'get',
  path: '/me/exports/{id}/download-url',
  auth: 'member',
  tag: 'me',
  summary:
    'The same short-lived signed link as JSON, for clients that authenticate with a bearer token (FR-ACCT-05, FR-MOB-01)',
  params: z.object({ id: Id }),
  status: 200,
  response: z.object({ url: z.string(), expires_at: Timestamp }),
  errors: ['not_found'],
});
