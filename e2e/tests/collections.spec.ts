// M7-T17 / FR-FEED-07: a member puts a received video into a new collection from its page, finds
// it under Saved → Collections, renames the collection and takes the video out again.
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { befriend, loginPage, person } from '../support/people';

test('a member collects a received video and manages the collection', async ({ page, baseURL }) => {
  const sam = await person(baseURL!, 'Sam');
  const jo = await person(baseURL!, 'Jo');
  await befriend(sam, jo);
  const video = await sam.api.addVideo('ok');
  const sent = (await sam.api.post('/shares', {
    video_id: video.id,
    recipient_ids: [jo.id],
    idempotency_key: crypto.randomUUID(),
  })) as { results: { share_id: string }[] };
  const shareId = sent.results[0]!.share_id;

  await loginPage(page, jo);
  await page.goto(`/shares/${shareId}`);
  await page.getByRole('button', { name: 'Add to collection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to collection' });
  await dialog.getByLabel('New collection').fill('Recipes');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Recipes' })).toBeChecked();
  await expectAccessible(page, '/shares/:id (add to collection)');
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Saved', exact: true }).click();
  const collections = page.getByRole('list', { name: 'Collections' });
  await expect(collections).toContainText('Recipes');
  await expect(collections).toContainText('1 video');
  // Adding to a collection saved the video (BR-COL-2).
  await expect(page.getByRole('list', { name: 'Saved' })).toContainText(video.title);
  await collections.getByRole('link', { name: /Recipes/ }).click();

  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recipes' })).toContainText(video.title);
  await expectAccessible(page, '/collections/:id');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name').fill('Cooking');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Cooking' })).toBeVisible();
  await page.getByRole('button', { name: `Remove “${video.title}” from this collection` }).click();
  await expect(page.getByText('No videos in this collection yet.', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete collection' }).click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole('list', { name: 'Collections' })).toHaveCount(0);
  // The video stays saved.
  await expect(page.getByRole('list', { name: 'Saved' })).toContainText(video.title);
  await sam.api.dispose();
  await jo.api.dispose();
});
