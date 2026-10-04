// M1-T7, M7-T4: FR-AUTH-01..06, FR-ACCT-02, FR-ADM-03, NFR-SEC-02/04/06, FR-ADM-05 (audit
// writes). Passkey-only sign-in (ADR-0018) with a software authenticator.
import { createHash, randomBytes } from 'node:crypto';
import {
  addPasskey,
  addPasskeyOptions,
  createInvite,
  createMobileCode,
  exchangeMobileCode,
  getInstance,
  getMe,
  listPasskeys,
  logout,
  register,
  registerOptions,
  removePasskey,
  renamePasskey,
  setupOptions,
  signIn,
  signInOptions,
} from '@vidfriends/contracts';
import { SoftAuthenticator, type TestClient } from '@vidfriends/test-utils';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, passkeys, relationships, sessions, users } from '../src/db/schema.js';
import { DAY, MINUTE } from '../src/infra/clock.js';
import { createRecoveryLink } from '../src/modules/auth/service.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  confirmPasskey,
  joinWith,
  registerMember,
  signInWith,
  uniqueName,
  type Member,
} from './support/factories.js';

let server: TestServer;
let admin: Member;

beforeAll(async () => {
  server = await createTestServer();
});
afterAll(async () => server.close());

/** A second browser with the same (synced) passkeys as `c`. */
function sameUserElsewhere(c: TestClient): TestClient {
  const other = server.client();
  other.authenticator.credentials.push(...c.authenticator.credentials);
  return other;
}

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

describe('FR-AUTH-01 setup bootstrap', () => {
  it('logs a one-time setup token while unclaimed', () => {
    expect(server.deps.setup.token).toBeTruthy();
    expect(server.logs.join('')).toContain(server.deps.setup.token as string);
    expect(server.logs.join('')).toContain('https://vf.test/setup');
  });

  it('rejects a wrong token with 401', async () => {
    const res = await server.client().call(setupOptions, {
      body: { setup_token: 'wrong', instance_name: 'X', username: 'mallory' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('setup_invalid');
  });

  it('creates the first admin with a passkey, names the instance and invalidates the token', async () => {
    const token = server.deps.setup.token as string;
    admin = await claimAdmin(server);
    expect(admin.user.role).toBe('admin');
    expect(server.deps.setup.token).toBeNull();
    const info = await server.client().ok(getInstance);
    expect(info).toMatchObject({ name: 'Test Circle', setup_complete: true });
    const again = await server.client().call(setupOptions, {
      body: { setup_token: token, instance_name: 'X', username: 'second' },
    });
    expect(again.status).toBe(404);
  });

  it('asks for a discoverable passkey with user verification for this server', async () => {
    const { code } = await admin.client.ok(createInvite, {});
    const start = await server.client().ok(registerOptions, {
      body: { username: uniqueName(), invite_code: code },
    });
    expect(start.options).toMatchObject({
      rp: { id: 'vf.test', name: 'Test Circle' },
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
    });
  });
});

describe('FR-AUTH-02 join', () => {
  it('requires an invite in invite_only mode', async () => {
    const res = await server.client().call(registerOptions, { body: { username: uniqueName() } });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('invite_invalid');
  });

  it('joins with an invite and a passkey, signs in, and auto-friends the inviter', async () => {
    const member = await registerMember(server, admin, { username: 'sam.member' });
    expect(member.user).toMatchObject({ username: 'sam.member', role: 'member' });
    expect((await member.client.ok(getMe)).user.id).toBe(member.user.id);
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
    const first = await joinWith(server.client(), code, { username: 'MixedCase' });
    expect(first.username).toBe('mixedcase');
    const dup = await server.client().call(registerOptions, {
      body: { username: 'mixedCASE', invite_code: code },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error?.code).toBe('username_taken');
  });

  it.each([['ab'], ['_leading'], ['has space'], ['x'.repeat(31)]])(
    'rejects invalid username %s',
    async (username) => {
      const { code } = await admin.client.ok(createInvite, {});
      const res = await server.client().call(registerOptions, {
        body: { username, invite_code: code },
      });
      expect(res.status).toBe(400);
      expect(res.body.error?.details).toMatchObject({ fields: { username: expect.any(String) } });
    },
  );

  it('never consumes an invite beyond max_uses under concurrency (BR-INV-2)', async () => {
    const { code, invite } = await admin.client.ok(createInvite, { body: { max_uses: 1 } });
    // Every attempt starts while the invite is still unused, then all finish at once.
    const started = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const c = server.client();
        const start = await c.ok(registerOptions, {
          body: { username: uniqueName('race'), invite_code: code },
        });
        return { c, start };
      }),
    );
    const attempts = await Promise.all(
      started.map(({ c, start }) =>
        c.call(register, {
          body: {
            ceremony_id: start.ceremony_id,
            credential: c.authenticator.create(start.options) as never,
          },
        }),
      ),
    );
    const statuses = attempts.map((a) => a.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
    const rows = await server.deps.db.execute(
      sql`select uses from invites where id = ${invite.id}`,
    );
    expect(rows.rows[0]).toEqual({ uses: 1 });
  });

  it('uses each ceremony once, rejects expired ones and credentials for another origin', async () => {
    const { code } = await admin.client.ok(createInvite, { body: { max_uses: 3 } });
    const c = server.client();
    const start = await c.ok(registerOptions, {
      body: { username: uniqueName(), invite_code: code },
    });
    const credential = c.authenticator.create(start.options) as never;
    expect(
      (await c.call(register, { body: { ceremony_id: start.ceremony_id, credential } })).status,
    ).toBe(201);
    const replay = await server.client().call(register, {
      body: { ceremony_id: start.ceremony_id, credential },
    });
    expect(replay.body.error?.code).toBe('ceremony_invalid');

    const late = server.client();
    const s2 = await late.ok(registerOptions, {
      body: { username: uniqueName(), invite_code: code },
    });
    server.clock.advance(6 * MINUTE);
    const expired = await late.call(register, {
      body: {
        ceremony_id: s2.ceremony_id,
        credential: late.authenticator.create(s2.options) as never,
      },
    });
    server.clock.advance(-6 * MINUTE);
    expect(expired.body.error?.code).toBe('ceremony_invalid');

    const phishing = server.client();
    const s3 = await phishing.ok(registerOptions, {
      body: { username: uniqueName(), invite_code: code },
    });
    const evil = new SoftAuthenticator('https://vf.test.evil.example');
    const wrongOrigin = await phishing.call(register, {
      body: { ceremony_id: s3.ceremony_id, credential: evil.create(s3.options) as never },
    });
    expect(wrongOrigin.body.error?.code).toBe('passkey_invalid');
  });
});

describe('FR-AUTH-04 sign-in and logout', () => {
  it('signs in with a passkey and sets HttpOnly Secure SameSite=Lax session and CSRF cookies (NFR-SEC-04)', async () => {
    const c = sameUserElsewhere(admin.client);
    const res = await signInWith(c);
    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe(admin.user.id);
    const cookies = res.headers.getSetCookie();
    const session = cookies.find((x) => x.startsWith('vf_session='));
    const csrf = cookies.find((x) => x.startsWith('vf_csrf='));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(csrf).not.toMatch(/HttpOnly/);
  });

  it('gives a generic error for a passkey this server does not know', async () => {
    const stranger = server.client();
    const start = await stranger.ok(signInOptions, { body: {} });
    // A passkey made for another account on another ceremony: unknown credential id here.
    stranger.authenticator.create({ challenge: 'x', rp: { id: 'vf.test' }, user: { id: 'AAAA' } });
    const res = await stranger.call(signIn, {
      body: {
        ceremony_id: start.ceremony_id,
        credential: stranger.authenticator.get(start.options) as never,
      },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('invalid_credentials');
  });

  it('rejects a replayed assertion (single-use challenge)', async () => {
    const c = sameUserElsewhere(admin.client);
    const start = await c.ok(signInOptions, { body: {} });
    const credential = c.authenticator.get(start.options) as never;
    expect(
      (await c.call(signIn, { body: { ceremony_id: start.ceremony_id, credential } })).status,
    ).toBe(200);
    const replay = await server
      .client()
      .call(signIn, { body: { ceremony_id: start.ceremony_id, credential } });
    expect(replay.body.error?.code).toBe('ceremony_invalid');
  });

  it('stores only token hashes (NFR-SEC-02)', async () => {
    const c = sameUserElsewhere(admin.client);
    await signInWith(c);
    const token = c.cookies.get('vf_session') as string;
    const rows = await server.deps.db.select().from(sessions);
    for (const row of rows) {
      expect(row.tokenHash.length).toBe(32);
      expect(row.tokenHash.toString('base64url')).not.toBe(token);
    }
  });

  it('logout revokes the current session only', async () => {
    const a = sameUserElsewhere(admin.client);
    const b = sameUserElsewhere(admin.client);
    await signInWith(a);
    await signInWith(b);
    const sessionCookie = a.cookies.get('vf_session');
    await a.ok(logout, { body: { all: false } });
    expect(a.cookies.has('vf_session')).toBe(false);
    a.cookies.set('vf_session', sessionCookie as string);
    expect((await a.call(getMe)).status).toBe(401);
    expect((await b.call(getMe)).status).toBe(200);
  });

  it('"log out everywhere" revokes all sessions', async () => {
    const m = await registerMember(server, admin);
    const other = sameUserElsewhere(m.client);
    await signInWith(other);
    await m.client.ok(logout, { body: { all: true } });
    expect((await other.call(getMe)).status).toBe(401);
    const left = await server.deps.db.select().from(sessions).where(eq(sessions.userId, m.user.id));
    expect(left).toHaveLength(0);
  });
});

describe('WF-AUTH-5 mobile browser hand-off', () => {
  it('exchanges a single-use PKCE-bound code for a bearer session', async () => {
    const m = await registerMember(server, admin);
    const { verifier, challenge } = pkce();
    const { code } = await m.client.ok(createMobileCode, { body: { code_challenge: challenge } });
    const app = server.client();
    const res = await app.ok(exchangeMobileCode, { body: { code, code_verifier: verifier } });
    expect(res.user.id).toBe(m.user.id);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const bearer = server.client({ bearer: res.token });
    expect((await bearer.ok(getMe)).user.id).toBe(m.user.id);
    const [row] = await server.deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, createHash('sha256').update(res.token).digest()));
    expect(row?.client).toBe('mobile');
    const again = await app.call(exchangeMobileCode, { body: { code, code_verifier: verifier } });
    expect(again.body.error?.code).toBe('code_invalid');
  });

  it('refuses a wrong verifier and an expired code', async () => {
    const m = await registerMember(server, admin);
    const { verifier, challenge } = pkce();
    const first = await m.client.ok(createMobileCode, { body: { code_challenge: challenge } });
    const wrong = await server
      .client()
      .call(exchangeMobileCode, { body: { code: first.code, code_verifier: pkce().verifier } });
    expect(wrong.body.error?.code).toBe('code_invalid');
    const second = await m.client.ok(createMobileCode, { body: { code_challenge: challenge } });
    server.clock.advance(61_000);
    const late = await server
      .client()
      .call(exchangeMobileCode, { body: { code: second.code, code_verifier: verifier } });
    server.clock.advance(-61_000);
    expect(late.body.error?.code).toBe('code_invalid');
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
    const anon = await server.client().call(signInOptions, {
      body: {},
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
    const { verifier, challenge } = pkce();
    const { code } = await admin.client.ok(createMobileCode, {
      body: { code_challenge: challenge },
    });
    const { token } = await server
      .client()
      .ok(exchangeMobileCode, { body: { code, code_verifier: verifier } });
    const bearer = server.client({ bearer: token });
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
      b.authenticator.credentials.push(...a.client.authenticator.credentials);
      expect((await signInWith(b)).status).toBe(200);
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
  it('rejects existing sessions on the next request and refuses sign-in after the passkey verifies', async () => {
    const m = await registerMember(server, admin);
    expect((await m.client.call(getMe)).status).toBe(200);
    await server.deps.db.update(users).set({ status: 'suspended' }).where(eq(users.id, m.user.id));
    expect((await m.client.call(getMe)).status).toBe(401);
    const res = await signInWith(sameUserElsewhere(m.client));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('account_suspended');
  });

  it('re-reads the role from the database on every request', async () => {
    const m = await registerMember(server, admin);
    await server.deps.db.update(users).set({ role: 'admin' }).where(eq(users.id, m.user.id));
    expect((await m.client.ok(getMe)).user.role).toBe('admin');
  });
});

describe('FR-ACCT-02 manage passkeys', () => {
  async function addSecond(c: TestClient, name?: string) {
    const start = await c.ok(addPasskeyOptions, { body: {} });
    return (
      await c.ok(addPasskey, {
        body: {
          ceremony_id: start.ceremony_id,
          credential: c.authenticator.create(start.options) as never,
          passkey_name: name,
        },
      })
    ).passkey;
  }

  it('lists, adds and renames passkeys', async () => {
    const m = await registerMember(server, admin);
    const before = await m.client.ok(listPasskeys);
    expect(before.items).toHaveLength(1);
    expect(before.items[0]).toMatchObject({ current: true, backed_up: false });
    const added = await addSecond(m.client, 'Laptop');
    expect(added.name).toBe('Laptop');
    const renamed = await m.client.ok(renamePasskey, {
      params: { id: added.id },
      body: { name: 'Work laptop' },
    });
    expect(renamed.passkey.name).toBe('Work laptop');
    expect((await m.client.ok(listPasskeys)).items.map((p) => p.name)).toContain('Work laptop');
    // The add ceremony excludes passkeys the account already has.
    const again = await m.client.ok(addPasskeyOptions, { body: {} });
    expect((again.options.excludeCredentials as unknown[]).length).toBe(2);
  });

  it('removes a passkey only after a recent confirmation, never the last, and revokes its sessions', async () => {
    const m = await registerMember(server, admin);
    const [first] = (await m.client.ok(listPasskeys)).items;
    const unconfirmed = await m.client.call(removePasskey, { params: { id: first!.id } });
    expect(unconfirmed.body.error?.code).toBe('reauth_required');
    await confirmPasskey(m.client);
    const last = await m.client.call(removePasskey, { params: { id: first!.id } });
    expect(last.body.error?.code).toBe('last_passkey');

    const second = await addSecond(m.client);
    // A browser signed in with the second passkey loses its session when that passkey goes.
    const laptop = sameUserElsewhere(m.client);
    expect((await signInWith(laptop, m.client.authenticator.credentials[1]!.id)).status).toBe(200);
    await confirmPasskey(m.client);
    expect((await m.client.call(removePasskey, { params: { id: second.id } })).status).toBe(204);
    expect((await laptop.call(getMe)).status).toBe(401);
    expect((await m.client.call(getMe)).status).toBe(200);
    // The confirmation lasts 5 minutes.
    await addSecond(m.client);
    server.clock.advance(6 * MINUTE);
    const [, third] = (await m.client.ok(listPasskeys)).items;
    const stale = await m.client.call(removePasskey, { params: { id: third!.id } });
    server.clock.advance(-6 * MINUTE);
    expect(stale.body.error?.code).toBe('reauth_required');
  });
});

describe('FR-ADM-03 recovery-link server command', () => {
  it('prints a link for any member, including an admin, audited without an actor', async () => {
    const link = await createRecoveryLink(server.deps, {
      userId: admin.user.id,
      actorId: null,
      ip: null,
    });
    expect(link.url).toMatch(/^https:\/\/vf\.test\/recover\/[A-Za-z0-9_-]{43}$/);
    const [entry] = await server.deps.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'user.recovery_link'));
    expect(entry).toMatchObject({ actorId: null, targetId: admin.user.id });
  });
});

describe('NFR-SEC-06 auth rate limits', () => {
  it('limits sign-in attempts per IP to 10 per minute', async () => {
    const s = await createTestServer();
    try {
      await claimAdmin(s);
      const c = s.client();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await c.call(signInOptions, { body: {} })).status);
      }
      expect(statuses.slice(0, 10).every((x) => x === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
      const res = await c.call(signInOptions, { body: {} });
      expect(res.headers.get('retry-after')).toBeTruthy();
      s.clock.advance(61_000);
      expect((await c.call(signInOptions, { body: {} })).status).toBe(200);
    } finally {
      await s.close();
    }
  });
});

describe('FR-ADM-05 audit writes', () => {
  it('records sign-ins, failures, invites, registrations and passkey changes without secrets', async () => {
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
      'user.passkey_added',
      'user.passkey_removed',
    ]) {
      expect(actions).toContain(a);
    }
    const keys = await server.deps.db.select().from(passkeys);
    const dump = JSON.stringify(rows);
    for (const k of keys) expect(dump).not.toContain(k.publicKey.toString('base64url'));
  });

  it('is append-only', async () => {
    await expect(server.deps.db.execute(sql`update audit_log set action = 'x'`)).rejects.toThrow();
    await expect(server.deps.db.execute(sql`delete from audit_log`)).rejects.toThrow();
  });
});
