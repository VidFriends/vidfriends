import type { Context } from 'hono';
import type { Logger } from '../infra/logger.js';

export interface Viewer {
  id: string;
  username: string;
  displayName: string;
  role: 'member' | 'admin';
  sessionId: string;
  sessionHash: Buffer;
  client: 'web' | 'mobile';
  /** Last passkey confirmation in this session (sensitive actions, WF-ACCT-2/3). */
  reauthAt: Date | null;
  /** How the request authenticated; cookie-authenticated unsafe requests need CSRF checks. */
  via: 'cookie' | 'bearer';
}

export interface AppEnv {
  Variables: {
    requestId: string;
    log: Logger;
    clientIp: string;
    viewer: Viewer | null;
  };
}

export type AppContext = Context<AppEnv>;
