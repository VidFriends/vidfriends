export * from './common.js';
export * from './route.js';
export * from './settings.js';
export * from './routes/accounts.js';
export * from './routes/invites.js';
export * from './routes/friends.js';
export * from './routes/videos.js';
export * from './routes/shares.js';
export * from './routes/notifications.js';
export * from './routes/admin.js';
export * from './routes/exports.js';
export * from './routes/passkeys.js';

import * as accounts from './routes/accounts.js';
import * as invites from './routes/invites.js';
import * as friends from './routes/friends.js';
import * as videos from './routes/videos.js';
import * as shares from './routes/shares.js';
import * as notifications from './routes/notifications.js';
import * as admin from './routes/admin.js';
import * as exportsRoutes from './routes/exports.js';
import * as passkeys from './routes/passkeys.js';
import type { RouteDef } from './route.js';

function collect(...modules: Record<string, unknown>[]): RouteDef[] {
  const out: RouteDef[] = [];
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (
        value &&
        typeof value === 'object' &&
        'id' in value &&
        'method' in value &&
        'path' in value
      ) {
        out.push(value as RouteDef);
      }
    }
  }
  return out;
}

/** Every API route, in a stable order. The server must register exactly these. */
export const allRoutes: readonly RouteDef[] = collect(
  accounts,
  invites,
  friends,
  videos,
  shares,
  notifications,
  admin,
  exportsRoutes,
  passkeys,
);
