// M2-T5 / FR-FRND-01..05: request → accept → remove → block → unblock across two users.
import { expect, test } from '@playwright/test';
import type { SoftAuthenticator } from '@vidfriends/test-utils/authenticator';
import { expectAccessible } from '../support/a11y';
import { Api } from '../support/api';
import { authenticator } from '../support/passkeys';
import { loginPage } from '../support/people';

test('two members become friends, part ways, block and unblock', async ({ browser, baseURL }) => {
  const admin = await Api.admin(baseURL as string);
  const stamp = Date.now() % 100000;
  const names = { a: `ana${stamp}`, b: `ben${stamp}` };
  const keys: Record<string, SoftAuthenticator> = {};
  for (const [key, name] of Object.entries(names)) {
    const { code } = await admin.createInvite({ auto_friend: false });
    const api = await Api.create(baseURL as string);
    keys[key] = authenticator(baseURL as string);
    await api.register(code, name, key === 'a' ? 'Ana' : 'Ben', keys[key]);
    await api.dispose();
  }

  const ana = await (await browser.newContext()).newPage();
  const ben = await (await browser.newContext()).newPage();
  await loginPage(ana, { auth: keys.a! });
  await loginPage(ben, { auth: keys.b! });

  // Ana finds Ben and sends a request.
  await ana.getByRole('link', { name: 'Friends', exact: true }).click();
  await expect(ana.getByRole('heading', { name: 'Friends', level: 1 })).toBeVisible();
  await expectAccessible(ana, '/friends');
  await ana.getByLabel('Find people on this server').fill(names.b);
  const result = ana
    .getByRole('list', { name: 'Find people on this server' })
    .getByRole('listitem')
    .filter({ hasText: names.b });
  await result.getByRole('button', { name: 'Add friend' }).click();
  await expect(result).toContainText('Request sent');
  await expect(ana.getByRole('list', { name: 'Requests you sent' })).toContainText(names.b);

  // Ben accepts.
  await ben.goto('/friends');
  const incoming = ben
    .getByRole('list', { name: 'Requests for you' })
    .getByRole('listitem')
    .filter({ hasText: names.a });
  await incoming.getByRole('button', { name: 'Accept' }).click();
  await expect(ben.getByRole('list', { name: 'Your friends' })).toContainText(names.a);
  await ana.reload();
  await expect(ana.getByRole('list', { name: 'Your friends' })).toContainText(names.b);

  // Ana removes Ben.
  const friendRow = ana
    .getByRole('list', { name: 'Your friends' })
    .getByRole('listitem')
    .filter({ hasText: names.b });
  await friendRow.getByRole('button', { name: 'Remove' }).click();
  await ana.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(ana.getByText('No friends yet.')).toBeVisible();

  // Ana blocks Ben from search; Ben can no longer find Ana.
  await ana.getByLabel('Find people on this server').fill(names.b);
  const again = ana
    .getByRole('list', { name: 'Find people on this server' })
    .getByRole('listitem')
    .filter({ hasText: names.b });
  await again.getByRole('button', { name: 'Block' }).click();
  await ana.getByRole('dialog').getByRole('button', { name: 'Block' }).click();
  await expect(ana.getByRole('list', { name: 'Blocked' })).toContainText(names.b);
  await ben.goto('/friends');
  await ben.getByLabel('Find people on this server').fill(names.a);
  await expect(ben.getByText('Nobody found.')).toBeVisible();

  // Ana unblocks; they are back to no relationship.
  await ana.getByRole('list', { name: 'Blocked' }).getByRole('button', { name: 'Unblock' }).click();
  await expect(ana.getByText("You haven't blocked anyone.")).toBeVisible();
  await ben.getByLabel('Find people on this server').fill(`${names.a.slice(0, 5)}`);
  await expect(ben.getByRole('list', { name: 'Find people on this server' })).toContainText(
    names.a,
  );
  await admin.dispose();
});
