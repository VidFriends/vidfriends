// M1-T8: FR-INV-01..02, BR-INV-1..5, FR-PAIR-04 preview.
import {
  createInvite,
  listInvites,
  previewInvite,
  register,
  registerOptions,
  revokeInvite,
} from '@vidfriends/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { invites } from '../src/db/schema.js';
import { DAY } from '../src/infra/clock.js';
import { hashToken } from '../src/infra/tokens.js';
import { updateSettings } from '../src/modules/settings/service.js';
import { createTestServer, type TestServer } from './support/app.js';
import { claimAdmin, registerMember, uniqueName, type Member } from './support/factories.js';

let server: TestServer;
let admin: Member;
let member: Member;

beforeAll(async () => {
  server = await createTestServer();
  admin = await claimAdmin(server);
  member = await registerMember(server, admin, { displayName: 'Sam' });
});
afterAll(async () => server.close());

/** Joins with a new passkey; returns the failing call (options or finish) or the final one. */
async function join(code: string, c = server.client()) {
  const start = await c.call(registerOptions, {
    body: { username: uniqueName(), invite_code: code },
  });
  if (start.status !== 200) return start;
  return c.call(register, {
    body: {
      ceremony_id: start.body.ceremony_id,
      credential: c.authenticator.create(start.body.options) as never,
    },
  });
}

describe('FR-INV-01 create', () => {
  it('returns the code and join URL once and stores only the hash', async () => {
    const res = await member.client.ok(createInvite, {
      body: { max_uses: 3, expires_in_days: 2, auto_friend: false },
    });
    expect(res.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.join_url).toBe(`https://vf.test/join/${res.code}`);
    expect(res.invite).toMatchObject({
      max_uses: 3,
      uses: 0,
      auto_friend: false,
      status: 'active',
    });
    const [row] = await server.deps.db.select().from(invites).where(eq(invites.id, res.invite.id));
    expect(row?.codeHash.equals(hashToken(res.code))).toBe(true);
    const listed = await member.client.ok(listInvites, {});
    expect(JSON.stringify(listed)).not.toContain(res.code);
  });

  it('applies defaults (1 use, 7 days, auto_friend) and bounds (BR-INV-1)', async () => {
    const res = await member.client.ok(createInvite, {});
    expect(res.invite.max_uses).toBe(1);
    expect(res.invite.auto_friend).toBe(true);
    const days = (Date.parse(res.invite.expires_at) - Date.parse(res.invite.created_at)) / DAY;
    expect(days).toBeCloseTo(7, 5);
    expect((await member.client.call(createInvite, { body: { max_uses: 51 } })).status).toBe(400);
    expect((await member.client.call(createInvite, { body: { expires_in_days: 91 } })).status).toBe(
      400,
    );
  });

  it('forbids members when members_can_invite is off, but not admins', async () => {
    await updateSettings(server.deps.db, { members_can_invite: false }, null);
    try {
      const res = await member.client.call(createInvite, {});
      expect(res.status).toBe(403);
      expect((await admin.client.call(createInvite, {})).status).toBe(201);
    } finally {
      await updateSettings(server.deps.db, { members_can_invite: true }, null);
    }
  });

  it('requires authentication', async () => {
    expect((await server.client().call(createInvite, {})).status).toBe(401);
  });
});

describe('FR-INV-02 list and revoke', () => {
  it('lists own invites newest first with cursor pagination', async () => {
    const m = await registerMember(server, admin);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await m.client.ok(createInvite, {})).invite.id);
    const p1 = await m.client.ok(listInvites, { query: { limit: 3 } });
    expect(p1.items.map((i) => i.id)).toEqual(ids.slice(2).reverse());
    const p2 = await m.client.ok(listInvites, {
      query: { limit: 3, cursor: p1.next_cursor as string },
    });
    expect(p2.items.map((i) => i.id)).toEqual(ids.slice(0, 2).reverse());
    expect(p2.next_cursor).toBeNull();
  });

  it('lets admins list all invites but not members', async () => {
    const all = await admin.client.ok(listInvites, { query: { scope: 'all', limit: 50 } });
    expect(all.items.some((i) => i.created_by.id === member.user.id)).toBe(true);
    expect((await member.client.call(listInvites, { query: { scope: 'all' } })).status).toBe(403);
  });

  it('lets the creator or an admin revoke; others get 404 (BR-GEN-3)', async () => {
    const { invite, code } = await member.client.ok(createInvite, {});
    const other = await registerMember(server, admin);
    expect((await other.client.call(revokeInvite, { params: { id: invite.id } })).status).toBe(404);
    expect((await member.client.call(revokeInvite, { params: { id: invite.id } })).status).toBe(
      204,
    );
    expect((await join(code)).body.error?.code).toBe('invite_invalid');

    const second = await member.client.ok(createInvite, {});
    expect(
      (await admin.client.call(revokeInvite, { params: { id: second.invite.id } })).status,
    ).toBe(204);
  });
});

describe('invite validity', () => {
  it('rejects expired invites with the generic error', async () => {
    const { code } = await member.client.ok(createInvite, { body: { expires_in_days: 1 } });
    server.clock.advance(DAY + 1000);
    try {
      const res = await join(code);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({
        code: 'invite_invalid',
        message: 'This invite is not valid',
      });
    } finally {
      server.clock.advance(-(DAY + 1000));
    }
  });

  it('rejects exhausted invites', async () => {
    const { code } = await member.client.ok(createInvite, { body: { max_uses: 2 } });
    expect((await join(code)).status).toBe(201);
    expect((await join(code)).status).toBe(201);
    expect((await join(code)).body.error?.code).toBe('invite_invalid');
  });

  it('previews only valid invites, showing the inviter display name (FR-PAIR-04)', async () => {
    const { code } = await member.client.ok(createInvite, {});
    const preview = await server.client().ok(previewInvite, { params: { code } });
    expect(preview.inviter_display_name).toBe('Sam');
    const bad = await server.client().call(previewInvite, { params: { code: 'not-a-real-code' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('invite_invalid');
  });
});
