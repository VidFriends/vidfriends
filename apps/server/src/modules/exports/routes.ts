import { createExport, downloadExport, getExportUrl, listExports } from '@vidfriends/contracts';
import { handler, Redirect } from '../../http/register.js';
import * as service from './service.js';

export const exportHandlers = [
  handler(createExport, async ({ deps, viewer, body, ip }) => ({
    export: await service.requestExport(deps, viewer, body.include_media, ip),
  })),
  handler(listExports, async ({ deps, viewer }) => ({
    items: await service.listExports(deps, viewer),
  })),
  handler(downloadExport, async ({ c, deps, viewer, params }) => {
    c.header('Cache-Control', 'no-store');
    return new Redirect(await service.downloadUrl(deps, viewer, params.id));
  }),
  // Bearer clients (the mobile app) open the signed link in the browser instead of following a
  // redirect with their Authorization header.
  handler(getExportUrl, async ({ deps, viewer, params }) => ({
    url: await service.downloadUrl(deps, viewer, params.id),
    expires_at: new Date(deps.clock.now().getTime() + service.LINK_TTL_S * 1000).toISOString(),
  })),
];
