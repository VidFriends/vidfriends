// M2-T4: FR-ACCT-01 profile and avatar (BR-ACCT-3, NFR-SEC-08).
import {
  blockUser,
  createAvatarUpload,
  deleteAvatar,
  getAvatar,
  getAvatarUrl,
  getMe,
  setAvatar,
  updateMe,
} from '@vidfriends/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from './support/app.js';
import { claimAdmin, registerMember, type Member } from './support/factories.js';
import { hasS3 } from './support/s3.js';

let server: TestServer;
let admin: Member;
beforeAll(async () => {
  server = await createTestServer();
  admin = await claimAdmin(server);
});
afterAll(async () => server.close());

describe('display name', () => {
  it('trims, limits to 50 characters, and is visible on /me', async () => {
    const m = await registerMember(server, admin);
    const res = await m.client.ok(updateMe, { body: { display_name: '  Jo March  ' } });
    expect(res.user.display_name).toBe('Jo March');
    expect((await m.client.ok(getMe)).user.display_name).toBe('Jo March');
    expect((await m.client.call(updateMe, { body: { display_name: 'x'.repeat(51) } })).status).toBe(
      400,
    );
  });
});

async function upload(
  m: Member,
  bytes: Buffer,
  contentType: 'image/png' | 'image/jpeg' = 'image/png',
) {
  const slot = await m.client.ok(createAvatarUpload, {
    body: { bytes: bytes.length, content_type: contentType },
  });
  const put = await fetch(slot.put_url, {
    method: 'PUT',
    body: new Uint8Array(bytes),
    headers: { 'content-type': contentType },
  });
  expect(put.status).toBe(200);
  return slot.upload_id;
}

describe.skipIf(!hasS3)('avatar', () => {
  it('re-encodes an uploaded image to a 256×256 WebP served by redirect', async () => {
    const m = await registerMember(server, admin);
    const png = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#7c3aed' },
    })
      .png()
      .toBuffer();
    const res = await m.client.ok(setAvatar, { body: { upload_id: await upload(m, png) } });
    expect(res.user.avatar_url).toMatch(new RegExp(`^/api/v1/users/${m.user.id}/avatar\\?v=`));

    const redirect = await admin.client.call(getAvatar, { params: { user_id: m.user.id } });
    expect(redirect.status).toBe(302);
    const img = await fetch(redirect.headers.get('location') as string);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('gives bearer clients the same signed URL as data (FR-MOB-01)', async () => {
    const m = await registerMember(server, admin);
    const png = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#0ea5e9' },
    })
      .png()
      .toBuffer();
    await m.client.ok(setAvatar, { body: { upload_id: await upload(m, png) } });
    const { url, expires_at } = await admin.client.ok(getAvatarUrl, {
      params: { user_id: m.user.id },
    });
    expect(new Date(expires_at).getTime()).toBeGreaterThan(Date.now());
    const img = await fetch(url);
    expect(img.status).toBe(200);
    expect((await sharp(Buffer.from(await img.arrayBuffer())).metadata()).format).toBe('webp');
  });

  it('rejects a non-image disguised as an image (NFR-SEC-08)', async () => {
    const m = await registerMember(server, admin);
    const fake = Buffer.from('<?php echo "not an image"; ?>'.repeat(10));
    const res = await m.client.call(setAvatar, { body: { upload_id: await upload(m, fake) } });
    expect(res.status).toBe(400);
    expect(res.body.error?.details).toEqual({ fields: { upload_id: 'not_an_image' } });
    expect((await m.client.ok(getMe)).user.avatar_url).toBeNull();
  });

  it('refuses avatar slots over 2 MB and unknown upload ids', async () => {
    const m = await registerMember(server, admin);
    expect(
      (
        await m.client.call(createAvatarUpload, {
          body: { bytes: 2 * 1024 * 1024 + 1, content_type: 'image/png' },
        })
      ).status,
    ).toBe(400);
    expect(
      (await m.client.call(setAvatar, { body: { upload_id: 'A'.repeat(43) } })).body.error?.code,
    ).toBe('upload_incomplete');
  });

  it('cannot reuse another member upload id', async () => {
    const a = await registerMember(server, admin);
    const b = await registerMember(server, admin);
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const id = await upload(a, png);
    expect((await b.client.call(setAvatar, { body: { upload_id: id } })).body.error?.code).toBe(
      'upload_incomplete',
    );
  });

  it('hides avatars from blocked users and can be removed', async () => {
    const a = await registerMember(server, admin);
    const b = await registerMember(server, admin);
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await a.client.ok(setAvatar, { body: { upload_id: await upload(a, png) } });
    await a.client.ok(blockUser, { params: { user_id: b.user.id } });
    expect((await b.client.call(getAvatar, { params: { user_id: a.user.id } })).status).toBe(404);
    expect((await a.client.ok(deleteAvatar)).user.avatar_url).toBeNull();
    expect((await a.client.call(getAvatar, { params: { user_id: a.user.id } })).status).toBe(404);
  });
});
