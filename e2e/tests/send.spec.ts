// J-3 Send a video: add a link, choose friends, add a note, send (FR-SHR-01, PRD J-3).
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { befriend, loginPage, person } from '../support/people';

test('a member sends a link to two friends with a note', async ({ page, baseURL }) => {
  const sam = await person(baseURL!, 'Sam');
  const jo = await person(baseURL!, 'Jo');
  const kim = await person(baseURL!, 'Kim');
  await befriend(sam, jo);
  await befriend(sam, kim);

  await loginPage(page, sam);
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await page.getByLabel('Video link').fill(`https://www.youtube.com/watch?v=ok&j3=${Date.now()}`);
  await page.getByRole('button', { name: 'Add video' }).click();

  // Sending does not wait for processing (WF-SHR-1).
  await page.getByRole('checkbox', { name: 'Jo' }).check();
  await page.getByRole('checkbox', { name: 'Kim' }).check();
  await page.getByLabel('Note').fill('this made me laugh');
  await expectAccessible(page, 'send step 2');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Sent to Jo')).toBeVisible();
  await expect(page.getByText('Sent to Kim')).toBeVisible();

  // Jo receives it once the video is ready.
  await expect
    .poll(
      async () =>
        (await jo.api.get<{ items: { note: string }[] }>('/feed')).items.map((i) => i.note),
      { timeout: 60_000 },
    )
    .toContain('this made me laugh');
});
