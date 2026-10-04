// M5-T1/T3: FR-ADM-01..05, FR-ACCT-03/04, NFR-DATA-01, BR-ADM-1/2, BR-SES-2.
import {
  adminAudit,
  adminDeleteUser,
  adminGetSettings,
  adminListUsers,
  adminRecoveryLink,
  adminRunRetention,
  adminStorage,
  adminUpdateSettings,
  adminUpdateUser,
  deleteMe,
  getMe,
  listSessions,
  getRecovery,
  recover,
  recoveryOptions,
  revokeSessionRoute,
  sendShares,
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
  confirmPasskey,
  signInWith,
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
    const refused = await signInWith(m.client);
    expect(refused.status).toBe(403);
    expect(refused.body.error?.code).toBe('account_suspended');
    await admin.client.ok(adminUpdateUser, {
      params: { id: m.user.id },
      body: { status: 'active' },
    });
    expect((await signInWith(m.client)).status).toBe(200);
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
    await confirmPasskey(admin.client);
    expect((await admin.client.call(deleteMe, { body: {} })).body.error?.code).toBe('last_admin');
    // With a second admin it works, and a role change revokes the target's sessions (BR-SES-2).
    const second = await registerMember(server, admin);
    await admin.client.ok(adminUpdateUser, {
      params: { id: second.user.id },
      body: { role: 'admin' },
    });
    expect((await second.client.call(getMe)).status).toBe(401);
    const relog = second.client;
    relog.cookies.clear();
    expect((await signInWith(relog)).status).toBe(200);
    await relog.ok(adminUpdateUser, { params: { id: admin.user.id }, body: { role: 'member' } });
    await relog.ok(adminUpdateUser, { params: { id: admin.user.id }, body: { role: 'admin' } });
    admin.client.cookies.clear();
    expect((await signInWith(admin.client)).status).toBe(200);
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

/** Registers a new passkey with a recovery link on a fresh "device". */
async function recoverWith(token: string) {
  const device = server.client();
  const start = await device.call(recoveryOptions, { params: { token }, body: {} });
  if (start.status !== 200) return { device, res: start };
  const res = await device.call(recover, {
    params: { token },
    body: {
      ceremony_id: start.body.ceremony_id,
      credential: device.authenticator.create(start.body.options) as never,
    },
  });
  return { device, res };
}

describe('FR-ADM-03 recovery links (WF-ADM-4)', () => {
  it('registers a new passkey that replaces the old ones and revokes every session', async () => {
    const m = await registerMember(server, admin, { displayName: 'Lost Phone' });
    const { url } = await admin.client.ok(adminRecoveryLink, { params: { id: m.user.id } });
    expect(url).toMatch(/^https:\/\/vf\.test\/recover\/[A-Za-z0-9_-]{43}$/);
    const token = url.split('/').pop()!;
    expect(await server.client().ok(getRecovery, { params: { token } })).toMatchObject({
      username: m.user.username,
      display_name: 'Lost Phone',
    });

    const { device, res } = await recoverWith(token);
    expect(res.status).toBe(201);
    expect((await m.client.call(getMe)).status).toBe(401);
    // The lost passkey no longer signs in; the new one does.
    expect((await signInWith(m.client)).body.error?.code).toBe('invalid_credentials');
    device.cookies.clear();
    expect((await signInWith(device)).status).toBe(200);
    // Single use.
    expect((await recoverWith(token)).res.body.error?.code).toBe('recovery_invalid');
  });

  it('expires after 24 hours', async () => {
    const m = await registerMember(server, admin);
    const token = (await admin.client.ok(adminRecoveryLink, { params: { id: m.user.id } })).url
      .split('/')
      .pop()!;
    server.clock.advance(DAY + 1000);
    try {
      expect((await recoverWith(token)).res.body.error?.code).toBe('recovery_invalid');
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
    // A second browser with the same (synced) passkey.
    const other = server.client();
    other.authenticator.credentials.push(...m.client.authenticator.credentials);
    expect((await signInWith(other)).status).toBe(200);
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
  it('requires a recent passkey confirmation and removes the account, its shares and data', async () => {
    const a = await registerMember(server, admin, { autoFriend: false });
    const b = await registerMember(server, admin, { autoFriend: false });
    await setRelationship(server, a.user.id, b.user.id, 'accepted');
    const video = await makeVideo(server, a.user.id);
    await a.client.ok(sendShares, {
      body: { video_id: video, recipient_ids: [b.user.id], idempotency_key: idemKey() },
    });
    const unconfirmed = await a.client.call(deleteMe, { body: {} });
    expect(unconfirmed.body.error?.code).toBe('reauth_required');
    await confirmPasskey(a.client);
    expect((await a.client.call(deleteMe, { body: {} })).status).toBe(202);

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
