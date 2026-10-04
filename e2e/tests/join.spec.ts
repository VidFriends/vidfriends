// J-2: a friend joins through the join URL, is auto-friended, logs out and back in
// (FR-AUTH-02/04, FR-PAIR-04, FR-INV-03).
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { ADMIN, Api, PASSWORD } from '../support/api';

test('friend registers through the join link, then logs out and in', async ({ page, baseURL }) => {
  const admin = await Api.create(baseURL as string);
  await admin.login(ADMIN.username, ADMIN.password);
  const { join_url } = await admin.createInvite({ auto_friend: true });
  const username = `sam${Date.now() % 100000}`;

  await page.goto(join_url);
  await expect(page.getByRole('heading', { name: 'Join The Smiths' })).toBeVisible();
  await expect(page.getByText(/invited you/)).toBeVisible();
  await expectAccessible(page, '/join');

  await page.getByLabel('Display name').fill('Sam');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Sam!' })).toBeVisible();
  await expectAccessible(page, 'home');

  // The invite carried auto_friend, so Sam and the inviter are friends (checked via the API).
  const friends = await admin.get<{ items: { user: { username: string } }[] }>('/friends');
  expect(friends.items.map((f) => f.user.username)).toContain(username);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expectAccessible(page, '/login');

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Sam!' })).toBeVisible();

  // A reused or invalid join link shows a clear error.
  await page.goto('/join/not-a-real-code');
  await expect(page.getByRole('alert')).toContainText('This invite link is not valid');
  await admin.dispose();
});
