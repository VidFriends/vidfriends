// M5-T1 / FR-ADM-01..05: suspend → session rejected; last-admin protection; password-reset link.
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { ADMIN, PASSWORD } from '../support/api';
import { person } from '../support/people';

async function loginAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

test('admin suspends a member, cannot demote the last admin, and issues a reset link', async ({
  page,
  browser,
  baseURL,
}) => {
  const bob = await person(baseURL as string, 'Bob');
  await loginAdmin(page);
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
  await bobPage.goto('/login');
  await bobPage.getByLabel('Username').fill(bob.username);
  await bobPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await bobPage.getByRole('button', { name: 'Log in' }).click();
  await expect(bobPage.getByRole('alert')).toContainText('This account is suspended');

  await row.getByRole('button', { name: 'Unsuspend' }).click();
  await expect(row).toContainText('Active');

  // The only admin cannot remove their own admin role (FR-ADM-01).
  await page.getByLabel('Search by name').fill(ADMIN.username);
  const self = page.getByTestId(`admin-user-${ADMIN.username}`);
  await self.getByRole('button', { name: 'Remove admin' }).click();
  await expect(page.getByText('This is the only admin. Promote someone else first.')).toBeVisible();
  await expect(self).toContainText('Admin');

  // Password-reset link: single use, sets a new password (WF-ADM-4).
  await page.getByLabel('Search by name').fill(bob.username);
  await row.getByRole('button', { name: 'Password-reset link' }).click();
  const resetUrl = await page.getByTestId('reset-url').inputValue();
  expect(resetUrl).toMatch(/\/reset\/[\w-]+$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

  const newPassword = 'marigold-lantern-77';
  await bobPage.goto(new URL(resetUrl).pathname);
  await expect(bobPage.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expectAccessible(bobPage, '/reset');
  await bobPage.getByLabel('New password', { exact: true }).fill(newPassword);
  await bobPage.getByLabel('Repeat new password').fill(newPassword);
  await bobPage.getByRole('button', { name: 'Set password' }).click();
  await expect(bobPage.getByText('Password changed.')).toBeVisible();
  await bobPage.getByRole('link', { name: 'Go to login' }).click();
  await bobPage.getByLabel('Username').fill(bob.username);
  await bobPage.getByLabel('Password', { exact: true }).fill(newPassword);
  await bobPage.getByRole('button', { name: 'Log in' }).click();
  await expect(bobPage.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  // The link works once.
  await bobPage.goto(new URL(resetUrl).pathname);
  await bobPage.getByLabel('New password', { exact: true }).fill(newPassword);
  await bobPage.getByLabel('Repeat new password').fill(newPassword);
  await bobPage.getByRole('button', { name: 'Set password' }).click();
  await expect(bobPage.getByRole('alert')).toContainText('not valid');

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
