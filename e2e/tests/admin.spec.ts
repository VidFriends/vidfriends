// M5-T1 / FR-ADM-01..05: suspend → session rejected; last-admin protection; recovery link
// (FR-ADM-03, WF-ADM-4, ADR-0018).
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { ADMIN } from '../support/api';
import { adminAuthenticator, authenticator, usePasskeys } from '../support/passkeys';
import { loginPage, person } from '../support/people';

test('admin suspends a member, cannot demote the last admin, and issues a recovery link', async ({
  page,
  browser,
  baseURL,
}) => {
  const bob = await person(baseURL as string, 'Bob');
  await loginPage(page, { auth: adminAuthenticator(baseURL as string) });
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users$/);

  // Find Bob; the listing shows counts only (BR-ADM-1).
  await page.getByLabel('Search by name').fill(bob.username);
  const row = page.getByTestId(`admin-user-${bob.username}`);
  await expect(row).toContainText('0 sent · 0 received');
  await expect(page.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveCount(1);
  await expectAccessible(page, '/admin/users');

  // Suspend → Bob's existing session is rejected and he cannot log in (BR-SES-2, BR-ADM-2).
  await row.getByRole('button', { name: 'Suspend' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click();
  await expect(row).toContainText('Suspended');
  await expect(bob.api.get('/me')).rejects.toThrow(/401/);
  const bobPage = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await usePasskeys(bobPage, bob.auth);
  await bobPage.goto('/login');
  await bobPage.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(bobPage.getByRole('alert')).toContainText('This account is suspended');

  await row.getByRole('button', { name: 'Unsuspend' }).click();
  await expect(row).toContainText('Active');

  // The only admin cannot remove their own admin role (FR-ADM-01).
  await page.getByLabel('Search by name').fill(ADMIN.username);
  const self = page.getByTestId(`admin-user-${ADMIN.username}`);
  await self.getByRole('button', { name: 'Remove admin' }).click();
  await expect(page.getByText('This is the only admin. Promote someone else first.')).toBeVisible();
  await expect(self).toContainText('Admin');

  // Recovery link: single use; the new passkey replaces Bob's old one (WF-ADM-4).
  await page.getByLabel('Search by name').fill(bob.username);
  await row.getByRole('button', { name: 'Recovery link' }).click();
  const recoveryUrl = await page.getByTestId('reset-url').inputValue();
  expect(recoveryUrl).toMatch(/\/recover\/[\w-]+$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

  const newDevice = authenticator(baseURL as string);
  await usePasskeys(bobPage, newDevice);
  await bobPage.goto(new URL(recoveryUrl).pathname);
  await expect(bobPage.getByRole('heading', { name: 'Recover your account' })).toBeVisible();
  await expect(bobPage.getByText('For Bob')).toBeVisible();
  await expectAccessible(bobPage, '/recover');
  await bobPage.getByRole('button', { name: 'Create a new passkey' }).click();
  await expect(bobPage.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  expect(newDevice.credentials).toHaveLength(1);

  // The old passkey no longer signs in.
  await expect(bob.api.signIn(bob.auth)).rejects.toThrow(/401/);

  // The link works once.
  await bobPage.goto(new URL(recoveryUrl).pathname);
  await expect(bobPage.getByRole('alert')).toContainText('This recovery link is not valid');

  // Members cannot reach the console.
  await bobPage.goto('/admin/users');
  await expect(bobPage).toHaveURL(/\/$/);

  // The other admin screens render and are accessible.
  for (const [link, path] of [
    ['Settings', '/admin/settings'],
    ['Storage', '/admin/storage'],
    ['Audit log', '/admin/audit'],
  ] as const) {
    await page
      .getByRole('navigation', { name: 'Admin sections' })
      .getByRole('link', { name: link })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText('Loading…')).toHaveCount(0);
    await expectAccessible(page, path);
  }
  await expect(page.getByRole('table')).toContainText('admin.user_updated');
  await bob.api.dispose();
});
