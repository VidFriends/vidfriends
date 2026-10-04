// Opaque server-side sessions (ADR-0008, BR-SES-1..3, FR-AUTH-04..06).
import { createHmac } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { sessions, users } from '../../db/schema.js';
import { DAY, MINUTE } from '../../infra/clock.js';
import type { DbOrTx } from '../../infra/db.js';
import { newId } from '../../infra/ids.js';
import { hashToken, newToken } from '../../infra/tokens.js';
import type { AppContext, AppEnv, Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { getCookieValue } from '../../http/middleware.js';
import { getSettings } from '../settings/service.js';

export const SESSION_COOKIE = 'vf_session';
export const CSRF_COOKIE = 'vf_csrf';
const LAST_SEEN_RESOLUTION_MS = 5 * MINUTE;

export interface NewSession {
  token: string;
  hash: Buffer;
  id: string;
}

export async function createSession(
  db: DbOrTx,
  deps: Deps,
  input: { userId: string; client: 'web' | 'mobile'; userAgent: string; passkeyId?: string },
): Promise<NewSession> {
  const settings = await getSettings(db);
  const now = deps.clock.now();
  const token = newToken();
  const hash = hashToken(token);
  const id = newId();
  const absolute = new Date(now.getTime() + settings.session_absolute_days * DAY);
  const idle = new Date(
    Math.min(now.getTime() + settings.session_idle_days * DAY, absolute.getTime()),
  );
  await db.insert(sessions).values({
    tokenHash: hash,
    id,
    userId: input.userId,
    client: input.client,
    userAgent: input.userAgent.slice(0, 300),
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt: idle,
    absoluteExpiresAt: absolute,
    passkeyId: input.passkeyId ?? null,
  });
  return { token, hash, id };
}

/** Looks up a session token and re-validates expiry and account status (BR-SES-3). */
export async function resolveSession(
  deps: Deps,
  token: string,
  via: Viewer['via'],
): Promise<Viewer | null> {
  if (token.length < 20 || token.length > 100) return null;
  const hash = hashToken(token);
  const now = deps.clock.now();
  const rows = await deps.db
    .select({
      sessionId: sessions.id,
      client: sessions.client,
      lastSeenAt: sessions.lastSeenAt,
      idleExpiresAt: sessions.idleExpiresAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      reauthAt: sessions.reauthAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.idleExpiresAt <= now || row.absoluteExpiresAt <= now) {
    await deps.db.delete(sessions).where(eq(sessions.tokenHash, hash));
    return null;
  }
  if (row.status !== 'active') return null;
  if (now.getTime() - row.lastSeenAt.getTime() >= LAST_SEEN_RESOLUTION_MS) {
    const settings = await getSettings(deps.db);
    const idle = new Date(
      Math.min(now.getTime() + settings.session_idle_days * DAY, row.absoluteExpiresAt.getTime()),
    );
    await deps.db
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt: idle })
      .where(eq(sessions.tokenHash, hash));
    await deps.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, row.userId));
  }
  return {
    id: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    sessionId: row.sessionId,
    sessionHash: hash,
    client: row.client,
    reauthAt: row.reauthAt,
    via,
  };
}

export async function revokeSession(db: DbOrTx, hash: Buffer): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hash));
}

/** Revokes every session of a user, optionally keeping one (BR-SES-2). Returns the count. */
export async function revokeAllSessions(
  db: DbOrTx,
  userId: string,
  exceptHash?: Buffer,
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(
      exceptHash
        ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, exceptHash))
        : eq(sessions.userId, userId),
    )
    .returning({ id: sessions.id });
  return deleted.length;
}

export async function deleteExpiredSessions(db: DbOrTx, now: Date): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(sql`${sessions.idleExpiresAt} <= ${now} or ${sessions.absoluteExpiresAt} <= ${now}`)
    .returning({ id: sessions.id });
  return deleted.length;
}

/** Session-bound double-submit CSRF value (LLD §5): HMAC(APP_SECRET, session hash). */
export function csrfTokenFor(appSecret: string, sessionHash: Buffer): string {
  return createHmac('sha256', appSecret).update('csrf:').update(sessionHash).digest('base64url');
}

function cookieAttrs(deps: Deps, maxAgeSeconds: number, httpOnly: boolean): string {
  const secure = deps.env.PUBLIC_URL.startsWith('https:') ? '; Secure' : '';
  return `; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}${httpOnly ? '; HttpOnly' : ''}`;
}

export async function setSessionCookies(c: AppContext, deps: Deps, session: NewSession) {
  const settings = await getSettings(deps.db);
  const maxAge = settings.session_absolute_days * 24 * 3600;
  c.header('Set-Cookie', `${SESSION_COOKIE}=${session.token}${cookieAttrs(deps, maxAge, true)}`, {
    append: true,
  });
  setCsrfCookie(c, deps, session.hash, maxAge);
}

function setCsrfCookie(c: AppContext, deps: Deps, hash: Buffer, maxAge: number) {
  const value = csrfTokenFor(deps.env.APP_SECRET, hash);
  c.header('Set-Cookie', `${CSRF_COOKIE}=${value}${cookieAttrs(deps, maxAge, false)}`, {
    append: true,
  });
}

export function clearSessionCookies(c: AppContext, deps: Deps) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=${cookieAttrs(deps, 0, true)}`, { append: true });
  c.header('Set-Cookie', `${CSRF_COOKIE}=${cookieAttrs(deps, 0, false)}`, { append: true });
}

/** Resolves the viewer from a bearer token or the session cookie (SDD §2). */
export function sessionMiddleware(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('viewer', null);
    if (!c.req.path.startsWith('/api/')) return next();
    const auth = c.req.header('authorization');
    const cookieHeader = c.req.header('cookie');
    if (auth?.startsWith('Bearer ')) {
      c.set('viewer', await resolveSession(deps, auth.slice(7).trim(), 'bearer'));
    } else {
      const token = getCookieValue(cookieHeader, SESSION_COOKIE);
      if (token) {
        const viewer = await resolveSession(deps, token, 'cookie');
        c.set('viewer', viewer);
        if (!viewer) clearSessionCookies(c, deps);
        else if (c.req.method === 'GET' && !getCookieValue(cookieHeader, CSRF_COOKIE)) {
          // Re-issue a lost CSRF cookie so the client can keep making unsafe requests.
          const settings = await getSettings(deps.db);
          setCsrfCookie(c, deps, viewer.sessionHash, settings.session_absolute_days * 24 * 3600);
        }
      }
    }
    await next();
  };
}
