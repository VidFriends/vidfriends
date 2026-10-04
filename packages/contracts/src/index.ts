export * from './common.js';
export * from './route.js';
export * from './settings.js';
export * from './routes/accounts.js';
export * from './routes/invites.js';

import * as accounts from './routes/accounts.js';
import * as invites from './routes/invites.js';
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
export const allRoutes: readonly RouteDef[] = collect(accounts, invites);
