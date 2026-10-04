// M5-T1/T3: FR-ADM-01..05, FR-ACCT-03/04, NFR-DATA-01, BR-ADM-1/2, BR-SES-2.
import {
  adminAudit,
  adminDeleteUser,
  adminGetSettings,
  adminListUsers,
  adminPasswordReset,
  adminRunRetention,
  adminStorage,
  adminUpdateSettings,
  adminUpdateUser,
  deleteMe,
  getMe,
  listSessions,
  login,
  revokeSessionRoute,
  sendShares,
  usePasswordReset,
} from '@vidfriends/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, relationships, sessions, shares, users, videos } from '../src/db/schema.js';
import { DAY } from '../src/infra/clock.js';
import { createTestServer, type TestServer } from './support/app.js';
import {
  claimAdmin,
  idemKey,
  makeVideo,
  PASSWORD,
  registerMember,
  type Member,
} from './support/factories.js';
import { waitFor } from './support/wait.js';
import { setRelationship } from './support/world.js';

let server: TestServer;
let admin: Member;
beforeAll(async () => {
  server = await createTestServer({}, {}, { worker: true });
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

describe('FR-ADM-01 users', () => {
  it('lists and searches members with counts only (BR-ADM-1)', async () => {
    const m = await registerMember(server, admin, {
      username: 'searchable.zed',
      displayName: 'Zed',
    });
    const res = await admin.client.ok(adminListUsers, { query: { q: 'searchable' } });
    expect(res.items.map((u) => u.id)).toEqual([m.user.id]);
    expect(Object.keys(res.items[0]!).sort()).toEqual(
      [
        'created_at',
        'display_name',
        'id',
        'last_active_at',
        'quota_bytes_override',
        'role',
        'shares_received',
        'shares_sent',
        'status',
        'storage_bytes',
        'username',
      ].sort(),
    );
    expect((await m.client.call(adminListUsers, {})).status).toBe(403);
  });

  it('suspension rejects existing sessions at once and is reversible (FR-AUTH-06, BR-ADM-2)', async () => {
    const m = await registerMember(server, admin);
    const res = await admin.client.ok(adminUpdateUser, {
      params: { id: m.user.id },
      body: { status: 'suspended' },
    });
    expect(res.user.status).toBe('suspended');
    expect((await m.client.call(getMe)).status).toBe(401);
    expect(
      (
        await server
          .client()
          .call(login, { body: { username: m.user.username, password: PASSWORD, client: 'web' } })
      ).status,
    ).toBe(403);
    await admin.client.ok(adminUpdateUser, {
      params: { id: m.user.id },
      body: { status: 'active' },
    });
    expect(
      (
        await server
          .client()
          .call(login, { body: { username: m.user.username, password: PASSWORD, client: 'web' } })
      ).status,
    ).toBe(200);
  });

  it('never demotes, suspends or deletes the last admin', async () => {
    for (const body of [{ role: 'member' as const }, { status: 'suspended' as const }]) {
      const res = await admin.client.call(adminUpdateUser, { params: { id: admin.user.id }, body });
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('last_admin');
    }
    expect(
      (await admin.client.call(adminDeleteUser, { params: { id: admin.user.id } })).body.error
        ?.code,
    ).toBe('last_admin');
    expect(
      (await admin.client.call(deleteMe, { body: { password: PASSWORD } })).body.error?.code,
    ).toBe('last_admin');
    // With a second admin it works, and a role change revokes the target's sessions (BR-SES-2).
    const second = await registerMember(server, admin);
    await admin.client.ok(adminUpdateUser, {
      params: { id: second.user.id },
      body: { role: 'admin' },
    });
    expect((await second.client.call(getMe)).status).toBe(401);
    const relog = server.client();
    await relog.ok(login, {
      body: { username: second.user.username, password: PASSWORD, client: 'web' },
    });
    await relog.ok(adminUpdateUser, { params: { id: admin.user.id }, body: { role: 'member' } });
    await relog.ok(adminUpdateUser, { params: { id: admin.user.id }, body: { role: 'admin' } });
    admin.client = server.client();
    await admin.client.ok(login, {
      body: { username: 'admin', password: PASSWORD, client: 'web' },
    });
  });

  it('sets a per-user quota override', async () => {
    const m = await registerMember(server, admin);
    const res = await admin.client.ok(adminUpdateUser, {
      params: { id: m.user.id },
      body: { quota_bytes_override: 1234 },
    });
    expect(res.user.quota_bytes_override).toBe(1234);
  });
});

describe('FR-ADM-03 password reset links', () => {
  it('creates a single-use 24 h link that sets a new password and revokes all sessions', async () => {
    const m = await registerMember(server, admin);
    const { reset_url } = await admin.client.ok(adminPasswordReset, { params: { id: m.user.id } });
    expect(reset_url).toMatch(/^https:\/\/vf\.test\/reset\/[A-Za-z0-9_-]{43}$/);
    const token = reset_url.split('/').pop()!;
    const weak = await server
      .client()
      .call(usePasswordReset, { params: { token }, body: { new_password: 'password123' } });
    expect(weak.status).toBe(400);
    expect(
      (
        await server
          .client()
          .call(usePasswordReset, { params: { token }, body: { new_password: 'fresh-start-2026' } })
      ).status,
    ).toBe(204);
    expect((await m.client.call(getMe)).status).toBe(401);
    expect(
      (
        await server
          .client()
          .call(login, {
            body: { username: m.user.username, password: 'fresh-start-2026', client: 'web' },
          })
      ).status,
    ).toBe(200);
    const again = await server
      .client()
      .call(usePasswordReset, { params: { token }, body: { new_password: 'another-one-2026' } });
    expect(again.body.error?.code).toBe('reset_invalid');
  });

  it('expires after 24 hours', async () => {
    const m = await registerMember(server, admin);
    const token = (
      await admin.client.ok(adminPasswordReset, { params: { id: m.user.id } })
    ).reset_url
      .split('/')
      .pop()!;
    server.clock.advance(DAY + 1000);
    try {
      expect(
        (
          await server
            .client()
            .call(usePasswordReset, { params: { token }, body: { new_password: 'too-late-2026x' } })
        ).body.error?.code,
      ).toBe('reset_invalid');
    } finally {
      server.clock.advance(-(DAY + 1000));
    }
  });
});

describe('FR-ADM-02 settings', () => {
  it('validates, applies at request time and audits changes', async () => {
    const before = await admin.client.ok(adminGetSettings);
    expect(before.signup_mode).toBe('invite_only');
    const after = await admin.client.ok(adminUpdateSettings, {
      body: { retention_days: 30, members_can_invite: false },
    });
    expect(after).toMatchObject({
      retention_days: 30,
      members_can_invite: false,
      signup_mode: 'invite_only',
    });
    expect(
      (await admin.client.call(adminUpdateSettings, { body: { retention_days: -1 } })).status,
    ).toBe(400);
    expect(
      (await admin.client.call(adminUpdateSettings, { body: { session_idle_days: 400 } })).status,
    ).toBe(400);
    expect(
      (await admin.client.call(adminUpdateSettings, { body: { bogus: 1 } as never })).status,
    ).toBe(400);
    const auditRows = await admin.client.ok(adminAudit, {
      query: { action: 'admin.settings_changed' },
    });
    expect(auditRows.items[0]?.metadata).toEqual({ retention_days: 30, members_can_invite: false });
    await admin.client.ok(adminUpdateSettings, {
      body: { retention_days: 90, members_can_invite: true },
    });
  });
});

describe('FR-ADM-04/05 storage and audit', () => {
  it('reports storage and queues a retention run', async () => {
    const s = await admin.client.ok(adminStorage);
    expect(s).toMatchObject({ retention_days: 90 });
    expect(Object.keys(s.videos_by_state)).toContain('ready');
    expect(new Date(s.next_retention_run).getUTCHours()).toBe(3);
    expect((await admin.client.call(adminRunRetention, { body: {} })).status).toBe(202);
  });

  it('filters the audit log by actor and action, newest first', async () => {
    const page = await admin.client.ok(adminAudit, { query: { actor: admin.user.id, limit: 5 } });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((e) => e.actor_id === admin.user.id)).toBe(true);
    const ids = page.items.map((e) => e.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    const logins = await admin.client.ok(adminAudit, { query: { action: 'auth.login' } });
    expect(logins.items.every((e) => e.action.startsWith('auth.login'))).toBe(true);
  });
});

describe('FR-ACCT-04 sessions', () => {
  it('lists my sessions and revokes one', async () => {
    const m = await registerMember(server, admin);
    const other = server.client();
    await other.ok(login, {
      body: { username: m.user.username, password: PASSWORD, client: 'web' },
    });
    const list = await m.client.ok(listSessions);
    expect(list.items).toHaveLength(2);
    const notCurrent = list.items.find((s) => !s.current)!;
    expect(
      (await admin.client.call(revokeSessionRoute, { params: { id: notCurrent.id } })).status,
    ).toBe(404);
    expect(
      (await m.client.call(revokeSessionRoute, { params: { id: notCurrent.id } })).status,
    ).toBe(204);
    expect((await other.call(getMe)).status).toBe(401);
  });
});

describe('FR-ACCT-03 account deletion (WF-ACCT-3, NFR-DATA-01)', () => {
  it('requires the password and removes the account, its shares and data', async () => {
    const a = await registerMember(server, admin, { autoFriend: false });
    const b = await registerMember(server, admin, { autoFriend: false });
    await setRelationship(server, a.user.id, b.user.id, 'accepted');
    const video = await makeVideo(server, a.user.id);
    await a.client.ok(sendShares, {
      body: { video_id: video, recipient_ids: [b.user.id], idempotency_key: idemKey() },
    });
    expect((await a.client.call(deleteMe, { body: { password: 'wrong-password-1' } })).status).toBe(
      401,
    );
    expect((await a.client.call(deleteMe, { body: { password: PASSWORD } })).status).toBe(202);

    const id = a.user.id;
    const left = await server.deps.db.execute(sql`
      select (select count(*) from users where id = ${id})::int as users,
             (select count(*) from sessions where user_id = ${id})::int as sessions,
             (select count(*) from shares where sender_id = ${id} or recipient_id = ${id})::int as shares,
             (select count(*) from relationships where user_low = ${id} or user_high = ${id})::int as rels,
             (select count(*) from notifications where user_id = ${id} or actor_id = ${id})::int as notifs`);
    expect(left.rows[0]).toEqual({ users: 0, sessions: 0, shares: 0, rels: 0, notifs: 0 });
    // The video nobody else added or holds a share of is purged by the job.
    await waitFor(
      async () =>
        (await server.deps.db.select().from(videos).where(eq(videos.id, video))).length === 0,
      20_000,
      'media purge',
    );
    const entry = await server.deps.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'user.deleted'));
    expect(entry.some((e) => e.targetId === id && JSON.stringify(e.metadata) === '{}')).toBe(true);
    void [sessions, shares, relationships, users];
  });

  it('lets admins delete members (same semantics)', async () => {
    const m = await registerMember(server, admin);
    expect((await admin.client.call(adminDeleteUser, { params: { id: m.user.id } })).status).toBe(
      202,
    );
    expect((await m.client.call(getMe)).status).toBe(401);
  });
});
