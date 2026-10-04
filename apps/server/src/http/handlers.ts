import { authHandlers } from '../modules/auth/routes.js';
import { instanceHandlers } from '../modules/instance/routes.js';
import { inviteHandlers } from '../modules/invites/routes.js';
import type { RouteHandler } from './register.js';

/** Every route handler. `registerRoutes` fails at startup if one is missing (NFR-MAINT-01). */
export function allHandlers(): RouteHandler[] {
  return [...instanceHandlers, ...authHandlers, ...inviteHandlers] as unknown as RouteHandler[];
}
