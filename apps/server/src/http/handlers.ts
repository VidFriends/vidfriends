import { accountHandlers } from '../modules/accounts/routes.js';
import { authHandlers } from '../modules/auth/routes.js';
import { friendHandlers } from '../modules/friends/routes.js';
import { instanceHandlers } from '../modules/instance/routes.js';
import { inviteHandlers } from '../modules/invites/routes.js';
import { videoHandlers } from '../modules/videos/routes.js';
import type { RouteHandler } from './register.js';

/** Every route handler. `registerRoutes` fails at startup if one is missing (NFR-MAINT-01). */
export function allHandlers(): RouteHandler[] {
  return [
    ...instanceHandlers,
    ...authHandlers,
    ...accountHandlers,
    ...inviteHandlers,
    ...friendHandlers,
    ...videoHandlers,
  ] as unknown as RouteHandler[];
}
