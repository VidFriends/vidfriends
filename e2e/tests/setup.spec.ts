// J-1: an operator claims the instance and creates an invite (FR-AUTH-01, FR-INV-01/03, FR-PAIR-02).
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { ADMIN } from '../support/api';
import { setupTokenFromLogs } from '../support/stack';

test('operator claims the instance and creates an invite with link and QR', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Set up your VidFriends server' })).toBeVisible();
  await expectAccessible(page, '/setup');

  await page.getByLabel('Setup token').fill(setupTokenFromLogs());
  await page.getByLabel('Server name').fill('The Smiths');
  await page.getByLabel('Admin username').fill(ADMIN.username);
  await page.getByLabel('Admin password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Claim server' }).click();

  await expect(page).toHaveURL(/\/invites$/);
  await expect(page.getByRole('heading', { name: 'Invites', level: 1 })).toBeVisible();
  await expectAccessible(page, '/invites');

  await page.getByRole('button', { name: 'Create invite' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite ready' });
  await expect(dialog).toBeVisible();
  const joinUrl = await dialog.getByTestId('join-url').inputValue();
  expect(joinUrl).toMatch(/^https:\/\/localhost:\d+\/join\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByRole('img', { name: 'QR code for the join link' })).toBeVisible();
  await expectAccessible(page, 'invite dialog');
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  await expect(page.getByRole('list', { name: 'Your invites' }).getByRole('listitem')).toHaveCount(
    1,
  );

  // The setup page now reports the instance as claimed.
  await page.goto('/setup');
  await expect(page.getByText('This server has already been set up.')).toBeVisible();
});
