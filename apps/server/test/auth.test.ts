// M1-T7: FR-AUTH-01..06, FR-ACCT-02, NFR-SEC-02/04/06, FR-ADM-05 (audit writes).
import {
  changePassword,
  createInvite,
  getInstance,
  getMe,
  login,
  logout,
  register,
  setup,
} from '@vidfriends/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, relationships, sessions, users } from '../src/db/schema.js';
import { DAY } from '../src/infra/clock.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  PASSWORD,
  registerMember,
  uniqueName,
  type Member,
} from './support/factories.js';

let server: TestServer;
let admin: Member;

beforeAll(async () => {
  server = await createTestServer();
});
afterAll(async () => server.close());

describe('FR-AUTH-01 setup bootstrap', () => {
  it('logs a one-time setup token while unclaimed', () => {
    expect(server.deps.setup.token).toBeTruthy();
    expect(server.logs.join('')).toContain(server.deps.setup.token as string);
    expect(server.logs.join('')).toContain('https://vf.test/setup');
  });

  it('rejects a wrong token with 401', async () => {
    const res = await server.client().call(setup, {
      body: {
        setup_token: 'wrong',
        instance_name: 'X',
        username: 'mallory',
        password: PASSWORD,
        client: 'web',
      },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('setup_invalid');
  });

  it('creates the first admin, names the instance and invalidates the token', async () => {
    const token = server.deps.setup.token as string;
    admin = await claimAdmin(server);
    expect(admin.user.role).toBe('admin');
    expect(server.deps.setup.token).toBeNull();
    const info = await server.client().ok(getInstance);
    expect(info).toMatchObject({ name: 'Test Circle', setup_complete: true });
    const again = await server.client().call(setup, {
      body: {
        setup_token: token,
        instance_name: 'X',
        username: 'second',
        password: PASSWORD,
        client: 'web',
      },
    });
    expect(again.status).toBe(404);
  });
});

describe('FR-AUTH-02/03 registration', () => {
  it('requires an invite in invite_only mode', async () => {
    const res = await server.client().call(register, {
      body: { username: uniqueName(), password: PASSWORD, client: 'web' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('invite_invalid');
  });

  it('registers with an invite, logs in, and auto-friends the inviter', async () => {
    const member = await registerMember(server, admin, { username: 'sam.member' });
    expect(member.user).toMatchObject({ username: 'sam.member', role: 'member' });
    const me = await member.client.ok(getMe);
    expect(me.user.id).toBe(member.user.id);
    const [low, high] = [admin.user.id, member.user.id].sort();
    const rel = await server.deps.db
      .select()
      .from(relationships)
      .where(sql`user_low = ${low} and user_high = ${high}`);
    expect(rel[0]?.state).toBe('accepted');
  });

  it('does not auto-friend when auto_friend is false', async () => {
    const member = await registerMember(server, admin, { autoFriend: false });
    const [low, high] = [admin.user.id, member.user.id].sort();
    const rel = await server.deps.db
      .select()
      .from(relationships)
      .where(sql`user_low = ${low} and user_high = ${high}`);
    expect(rel).toHaveLength(0);
  });

  it('stores usernames lower-case and rejects duplicates case-insensitively', async () => {
    const { code } = await admin.client.ok(createInvite, { body: { max_uses: 2 } });
    const first = await server.client().ok(register, {
      body: { username: 'MixedCase', password: PASSWORD, invite_code: code, client: 'web' },
    });
    expect(first.user.username).toBe('mixedcase');
    const dup = await server.client().call(register, {
      body: { username: 'mixedCASE', password: PASSWORD, invite_code: code, client: 'web' },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error?.code).toBe('username_taken');
  });

  it.each([
    ['ab', 'username'],
    ['_leading', 'username'],
    ['has space', 'username'],
    ['x'.repeat(31), 'username'],
  ])('rejects invalid username %s', async (username, field) => {
    const { code } = await admin.client.ok(createInvite, {});
    const res = await server.client().call(register, {
      body: { username, password: PASSWORD, invite_code: code, client: 'web' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.details).toMatchObject({ fields: { [field]: expect.any(String) } });
  });

  it.each([
    ['short1234', 'password_too_short'],
    ['qwertyuiop', 'password_common'],
  ])('rejects weak password %s', async (password, reason) => {
    const { code } = await admin.client.ok(createInvite, {});
    const res = await server.client().call(register, {
      body: { username: uniqueName(), password, invite_code: code, client: 'web' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.details).toEqual({ fields: { password: reason } });
  });

  it('never consumes an invite beyond max_uses under concurrency (BR-INV-2)', async () => {
    const { code, invite } = await admin.client.ok(createInvite, { body: { max_uses: 1 } });
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () =>
        server.client().call(register, {
          body: {
            username: uniqueName('race'),
            password: PASSWORD,
            invite_code: code,
            client: 'web',
          },
        }),
      ),
    );
    const statuses = attempts.map((a) => a.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
    const rows = await server.deps.db.execute(
      sql`select uses from invites where id = ${invite.id}`,
    );
    expect(rows.rows[0]).toEqual({ uses: 1 });
  });

  it('returns a bearer token only to mobile clients', async () => {
    const { code } = await admin.client.ok(createInvite, {});
    const mobile = server.client();
    const res = await mobile.call(register, {
      body: {
        username: uniqueName('mob'),
        password: PASSWORD,
        invite_code: code,
        client: 'mobile',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mobile.cookies.size).toBe(0);
    const bearer = server.client({ bearer: res.body.token });
    expect((await bearer.call(getMe)).status).toBe(200);
  });
});

describe('FR-AUTH-04 login and logout', () => {
  it('sets an HttpOnly Secure SameSite=Lax session cookie and a CSRF cookie (NFR-SEC-04)', async () => {
    const c = server.client();
    const res = await c.call(login, {
      body: { username: 'ADMIN', password: PASSWORD, client: 'web' },
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    const cookies = res.headers.getSetCookie();
    const session = cookies.find((x) => x.startsWith('vf_session='));
    const csrf = cookies.find((x) => x.startsWith('vf_csrf='));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(csrf).not.toMatch(/HttpOnly/);
  });

  it('gives the same generic error for unknown users and wrong passwords', async () => {
    const a = await server
      .client()
      .call(login, { body: { username: 'nobody', password: PASSWORD, client: 'web' } });
    const b = await server
      .client()
      .call(login, { body: { username: 'admin', password: 'wrong-password-1', client: 'web' } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('stores only token hashes (NFR-SEC-02)', async () => {
    const c = server.client();
    const res = await c.call(login, {
      body: { username: 'admin', password: PASSWORD, client: 'mobile' },
    });
    const token = res.body.token as string;
    const rows = await server.deps.db.select().from(sessions);
    for (const row of rows) {
      expect(row.tokenHash.length).toBe(32);
      expect(row.tokenHash.toString('base64url')).not.toBe(token);
    }
  });

  it('logout revokes the current session only', async () => {
    const a = server.client();
    const b = server.client();
    await a.ok(login, { body: { username: 'admin', password: PASSWORD, client: 'web' } });
    await b.ok(login, { body: { username: 'admin', password: PASSWORD, client: 'web' } });
    const sessionCookie = a.cookies.get('vf_session');
    await a.ok(logout, { body: { all: false } });
    expect(a.cookies.has('vf_session')).toBe(false);
    a.cookies.set('vf_session', sessionCookie as string);
    expect((await a.call(getMe)).status).toBe(401);
    expect((await b.call(getMe)).status).toBe(200);
  });

  it('"log out everywhere" revokes all sessions', async () => {
    const m = await registerMember(server, admin);
    const other = server.client();
    await other.ok(login, {
      body: { username: m.user.username, password: PASSWORD, client: 'web' },
    });
    await m.client.ok(logout, { body: { all: true } });
    expect((await other.call(getMe)).status).toBe(401);
    const left = await server.deps.db.select().from(sessions).where(eq(sessions.userId, m.user.id));
    expect(left).toHaveLength(0);
  });
});

describe('NFR-SEC-04 CSRF', () => {
  it('rejects cookie-authenticated unsafe requests without the CSRF token', async () => {
    const m = await registerMember(server, admin);
    const res = await m.client.call(logout, {
      body: { all: false },
      headers: { 'x-csrf-token': 'nope' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('csrf_failed');
  });

  it('rejects cross-origin unsafe requests', async () => {
    const m = await registerMember(server, admin);
    const res = await m.client.call(logout, {
      body: { all: false },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    const anon = await server.client().call(login, {
      body: { username: 'admin', password: PASSWORD, client: 'web' },
      headers: { origin: 'https://evil.example' },
    });
    expect(anon.status).toBe(403);
  });

  it('requires an Origin header on cookie-authenticated unsafe requests', async () => {
    const m = await registerMember(server, admin);
    m.client.origin = null;
    const res = await m.client.call(logout, { body: { all: false } });
    expect(res.status).toBe(403);
  });

  it('exempts bearer-authenticated requests', async () => {
    const res = await server
      .client()
      .call(login, { body: { username: 'admin', password: PASSWORD, client: 'mobile' } });
    const bearer = server.client({ bearer: res.body.token });
    bearer.origin = null;
    expect((await bearer.call(logout, { body: { all: false } })).status).toBe(204);
  });
});

describe('FR-AUTH-05 session lifetimes (BR-SES-1)', () => {
  it('expires after 30 days idle, sliding on activity, and after 180 days absolute', async () => {
    const s = await createTestServer();
    try {
      const a = await claimAdmin(s);
      s.clock.advance(29 * DAY);
      expect((await a.client.call(getMe)).status).toBe(200); // slides the idle window
      s.clock.advance(29 * DAY);
      expect((await a.client.call(getMe)).status).toBe(200);
      s.clock.advance(31 * DAY);
      expect((await a.client.call(getMe)).status).toBe(401);

      const b = s.client();
      await b.ok(login, { body: { username: 'admin', password: PASSWORD, client: 'web' } });
      for (let i = 0; i < 7; i++) {
        s.clock.advance(25 * DAY);
        expect((await b.call(getMe)).status).toBe(200);
      }
      s.clock.advance(6 * DAY); // 181 days since creation
      expect((await b.call(getMe)).status).toBe(401);
    } finally {
      await s.close();
    }
  });
});

describe('FR-AUTH-06 suspension', () => {
  it('rejects existing sessions on the next request and refuses login after password check', async () => {
    const m = await registerMember(server, admin);
    expect((await m.client.call(getMe)).status).toBe(200);
    await server.deps.db.update(users).set({ status: 'suspended' }).where(eq(users.id, m.user.id));
    expect((await m.client.call(getMe)).status).toBe(401);
    const wrong = await server.client().call(login, {
      body: { username: m.user.username, password: 'wrong-password-1', client: 'web' },
    });
    expect(wrong.body.error?.code).toBe('invalid_credentials');
    const right = await server
      .client()
      .call(login, { body: { username: m.user.username, password: PASSWORD, client: 'web' } });
    expect(right.status).toBe(403);
    expect(right.body.error?.code).toBe('account_suspended');
  });

  it('re-reads the role from the database on every request', async () => {
    const m = await registerMember(server, admin);
    await server.deps.db.update(users).set({ role: 'admin' }).where(eq(users.id, m.user.id));
    expect((await m.client.ok(getMe)).user.role).toBe('admin');
  });
});

describe('FR-ACCT-02 change password', () => {
  it('requires the current password, enforces policy, and revokes other sessions', async () => {
    const m = await registerMember(server, admin);
    const other = server.client();
    await other.ok(login, {
      body: { username: m.user.username, password: PASSWORD, client: 'web' },
    });

    const wrong = await m.client.call(changePassword, {
      body: { current_password: 'nope-nope-nope', new_password: 'a-brand-new-secret' },
    });
    expect(wrong.status).toBe(401);
    const weak = await m.client.call(changePassword, {
      body: { current_password: PASSWORD, new_password: 'password123' },
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error?.details).toEqual({ fields: { new_password: 'password_common' } });

    await m.client.ok(changePassword, {
      body: { current_password: PASSWORD, new_password: 'a-brand-new-secret' },
    });
    expect((await m.client.call(getMe)).status).toBe(200);
    expect((await other.call(getMe)).status).toBe(401);
    const relog = await server.client().call(login, {
      body: { username: m.user.username, password: 'a-brand-new-secret', client: 'web' },
    });
    expect(relog.status).toBe(200);
  });
});

describe('NFR-SEC-06 auth rate limits', () => {
  it('limits login attempts per IP and per username to 10 per minute', async () => {
    const s = await createTestServer();
    try {
      await claimAdmin(s);
      const c = s.client();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (
            await c.call(login, {
              body: { username: 'admin', password: 'wrong-password-1', client: 'web' },
            })
          ).status,
        );
      }
      expect(statuses.slice(0, 10).every((x) => x === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
      // Per-username: a fresh IP is still limited for this username.
      const fresh = s.client();
      const res = await fresh.call(login, {
        body: { username: 'admin', password: PASSWORD, client: 'web' },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBeTruthy();
      // After the window, login works again.
      s.clock.advance(61_000);
      expect(
        (
          await fresh.call(login, {
            body: { username: 'admin', password: PASSWORD, client: 'web' },
          })
        ).status,
      ).toBe(200);
    } finally {
      await s.close();
    }
  });
});

describe('FR-ADM-05 audit writes', () => {
  it('records logins, failures, invites and registrations without secrets', async () => {
    const rows = await server.deps.db.select().from(auditLog);
    const actions = new Set(rows.map((r) => r.action));
    for (const a of [
      'setup.completed',
      'auth.login',
      'auth.login_failed',
      'invite.created',
      'invite.redeemed',
      'user.registered',
      'auth.logout',
      'auth.logout_all',
      'user.password_changed',
    ]) {
      expect(actions).toContain(a);
    }
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(PASSWORD);
  });

  it('is append-only', async () => {
    await expect(server.deps.db.execute(sql`update audit_log set action = 'x'`)).rejects.toThrow();
    await expect(server.deps.db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });
});
