// M7-T1 / FR-ACCT-05 / WF-ACCT-4: a member downloads a copy of their data from Settings.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { befriend, loginPage, person } from '../support/people';

test('member prepares and downloads a data export', async ({ page, baseURL }) => {
  const ada = await person(baseURL as string, 'Ada');
  const bo = await person(baseURL as string, 'Bo');
  await befriend(ada, bo);
  await loginPage(page, ada);

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Prepare my data' }).click();
  await expect(page.getByText('Preparing your data.')).toBeVisible();
  const list = page.getByRole('list', { name: 'Your data exports' });
  await expect(list.getByText('Ready')).toBeVisible({ timeout: 30_000 });
  // One export in progress at a time; a ready one does not block a new request.
  await expect(page.getByRole('button', { name: 'Prepare my data' })).toBeEnabled();
  await expectAccessible(page, '/settings');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    list.getByRole('link', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^vidfriends-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const bytes = await readFile(await download.path());
  // A ZIP file with the documented entries (contents are checked in the API tests).
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.includes('vidfriends-export/friends.json')).toBe(true);
});
