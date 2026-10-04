// M7-T8 / FR-NOTIF-06 (ADR-0019): an open tab updates live, through the production proxy, when a
// friend sends a video or another device reads the notifications. Polling runs every 60 s, so
// anything within the 5 s window came over the event stream.
import { expect, test } from '@playwright/test';
import { befriend, loginPage, person } from '../support/people';

test('the badge and inbox update live and clear when another device reads them', async ({
  browser,
  baseURL,
}) => {
  const sam = await person(baseURL!, 'Sam');
  const jo = await person(baseURL!, 'Jo');
  await befriend(sam, jo);
  // The friend request accepted by befriend() is already read on Jo's side.
  await jo.api.post('/notifications/read', { all: true });
  await sam.api.post('/notifications/read', { all: true });
  const video = await sam.api.addVideo('ok');

  const joPage = await (await browser.newContext()).newPage();
  const stream = joPage.waitForResponse((r) => r.url().endsWith('/api/v1/events'));
  await loginPage(joPage, jo);
  expect((await stream).status()).toBe(200);
  await joPage.getByRole('link', { name: 'Inbox', exact: true }).click();
  await expect(joPage.getByTestId('unread-badge')).toHaveCount(0);

  await sam.api.post('/shares', {
    video_id: video.id,
    recipient_ids: [jo.id],
    idempotency_key: crypto.randomUUID(),
  });
  await expect(joPage.getByTestId('unread-badge')).toHaveText('1', { timeout: 5_000 });
  await expect(joPage.getByRole('main')).toContainText(video.title, { timeout: 5_000 });

  // Jo reads everything on another device: the open tab's badge clears.
  await jo.api.post('/notifications/read', { all: true });
  await expect(joPage.getByTestId('unread-badge')).toHaveCount(0, { timeout: 5_000 });
  await sam.api.dispose();
  await jo.api.dispose();
});
