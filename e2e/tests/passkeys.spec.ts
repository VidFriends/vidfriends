// M7-T5 / FR-ACCT-02, WF-ACCT-2: a member adds, renames and removes passkeys in Settings;
// removing one needs a passkey confirmation and the last one cannot be removed (ADR-0018).
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { loginPage, person } from '../support/people';

test('member manages their passkeys in settings', async ({ page, baseURL }) => {
  const kim = await person(baseURL as string, 'Kim');
  await loginPage(page, kim);
  await page.goto('/settings');
  const list = page.getByRole('list', { name: 'Passkeys' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('this session');
  await expect(list.getByRole('button', { name: 'Remove' })).toBeDisabled();
  await expectAccessible(page, '/settings');

  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText('Passkey added.')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  expect(kim.auth.credentials).toHaveLength(2);

  const added = list.getByRole('listitem').nth(1);
  await added.getByRole('button', { name: 'Rename' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Work laptop');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(list).toContainText('Work laptop');

  await list
    .getByRole('listitem')
    .filter({ hasText: 'Work laptop' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByText('Passkey removed.')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).not.toContainText('Work laptop');
  await kim.api.dispose();
});
