// M7-T16 / FR-FRND-06: a member groups two friends on the Friends page and sends a video to the
// group in one step; each friend gets their own share (ADR-0010).
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { befriend, loginPage, person } from '../support/people';

test('a member creates a group and sends a video to it', async ({ page, baseURL }) => {
  const sam = await person(baseURL!, 'Sam');
  const jo = await person(baseURL!, 'Jo');
  const kim = await person(baseURL!, 'Kim');
  const lee = await person(baseURL!, 'Lee');
  await befriend(sam, jo);
  await befriend(sam, kim);
  await befriend(sam, lee);

  await loginPage(page, sam);
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByLabel('Group name').fill('Family');
  await page.getByRole('checkbox', { name: 'Jo' }).check();
  await page.getByRole('checkbox', { name: 'Kim' }).check();
  await page.getByRole('button', { name: 'Save group' }).click();
  const list = page.getByRole('list', { name: 'Groups' });
  await expect(list).toContainText('Family');
  await expect(list).toContainText('Jo, Kim');
  await expect(page.getByText('Group saved.')).toHaveCount(0, { timeout: 10_000 });
  await expectAccessible(page, '/friends (groups)');

  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Video link').fill(`https://www.youtube.com/watch?v=ok&grp=${Date.now()}`);
  await page.getByRole('button', { name: 'Add video' }).click();
  await page.getByRole('button', { name: 'Family (2 friends)' }).click();
  await expect(page.getByRole('checkbox', { name: 'Jo' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Kim' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Lee' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Sent to Jo')).toBeVisible();
  await expect(page.getByText('Sent to Kim')).toBeVisible();
  for (const p of [sam, jo, kim, lee]) await p.api.dispose();
});
