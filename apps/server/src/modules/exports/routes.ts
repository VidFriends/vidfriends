import { createExport, downloadExport, listExports } from '@vidfriends/contracts';
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
];
