// J-4 Watch + J-5 sender closure + J-6 revisit (FR-FEED-01..06, FR-ENG-01/02, FR-SHR-04/05,
// FR-NOTIF-01/05). Also NFR-PRIV-01: every request in the journey stays on this origin.
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { befriend, loginPage, person } from '../support/people';

test('watch, react, reply, then the sender sees it all; saved and history work', async ({
  browser,
  baseURL,
}) => {
  const sam = await person(baseURL!, 'Sam');
  const jo = await person(baseURL!, 'Jo');
  await befriend(sam, jo);
  const linkOnly = await sam.api.addVideo('unsupported');
  expect(linkOnly.state).toBe('link_only');
  const ready = await sam.api.addVideo('ok');
  expect(ready.state).toBe('ready');

  const joPage = await (await browser.newContext()).newPage();
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const watchRequests = (p: typeof joPage) =>
    p.on('request', (r) => {
      const url = new URL(r.url());
      if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== origin)
        foreign.push(r.url());
    });
  watchRequests(joPage);
  // A fake clock lets the 60 s polling interval elapse instantly (FR-NOTIF-05).
  await joPage.clock.install();
  await loginPage(joPage, jo);
  await expect(joPage.getByText('Nothing here yet.')).toBeVisible();

  // Sam sends two videos while Jo is looking; the badge updates within 60 s.
  const send = (videoId: string, note: string) =>
    sam.api.post('/shares', {
      video_id: videoId,
      recipient_ids: [jo.id],
      note,
      idempotency_key: crypto.randomUUID(),
    });
  await send(linkOnly.id, 'a link for you');
  await send(ready.id, 'and a clip');
  await joPage.clock.fastForward('01:05');
  // Two shares plus the friend request Sam sent while befriending.
  await expect(joPage.getByTestId('unread-badge')).toHaveText('3');

  // The feed offers the new videos; unwatched oldest first.
  await joPage.getByRole('button', { name: 'New videos — show them' }).click();
  const items = joPage.getByTestId('feed-item');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('a link for you');
  await expectAccessible(joPage, 'feed');

  // Link-only card: "Open original" counts as watched (BR-SHR-3).
  const card = items.first().getByTestId('link-card');
  const popup = joPage.waitForEvent('popup');
  await card.getByRole('link', { name: 'Open original' }).click();
  await (await popup).close();

  // React and reply on the first share.
  await items.first().getByRole('button', { name: 'Fire' }).click();
  await expect(items.first().getByRole('button', { name: /Fire/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await items
    .first()
    .getByRole('link', { name: /Conversation/ })
    .click();
  await expect(joPage.getByRole('heading', { name: 'Conversation' })).toBeVisible();
  await joPage.getByLabel(/Write a reply/).fill('haha love it');
  await joPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(joPage.getByText('haha love it')).toBeVisible();
  await expectAccessible(joPage, 'conversation');

  // J-5: Sam sees watched + reaction + reply count; unsends the unwatched one.
  const samPage = await (await browser.newContext()).newPage();
  watchRequests(samPage);
  await loginPage(samPage, sam);
  await samPage.getByRole('link', { name: 'Sent' }).click();
  const rows = samPage.getByTestId('sent-recipient');
  await expect(rows).toHaveCount(2);
  const watchedRow = rows.filter({ hasText: '1 reply' });
  await expect(watchedRow).toContainText('Watched');
  await expect(watchedRow).toContainText('🔥');
  await expectAccessible(samPage, '/sent');
  const unwatchedRow = rows.filter({ hasText: 'Delivered' });
  await unwatchedRow.getByRole('button', { name: 'Unsend' }).click();
  await samPage.getByRole('dialog').getByRole('button', { name: 'Unsend' }).click();
  await expect(rows).toHaveCount(1);

  // J-6: Jo saves the watched share and finds it in Saved and History.
  const shareId = (await jo.api.get<{ items: { id: string; note: string }[] }>('/history'))
    .items[0]!.id;
  await jo.api.patch(`/shares/${shareId}`, { saved: true });
  await joPage.getByRole('link', { name: 'Saved' }).click();
  await expect(joPage.getByRole('list', { name: 'Saved' })).toContainText('a link for you');
  await joPage.getByRole('link', { name: 'History' }).click();
  await joPage.getByLabel('Search titles').fill('Probed');
  await expect(joPage.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(1);
  await expectAccessible(joPage, '/history');

  expect(foreign, 'requests to other origins (NFR-PRIV-01)').toEqual([]);
});
