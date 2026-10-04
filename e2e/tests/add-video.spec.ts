// M3-T8 / PRD J-3 step 1: a fixture link becomes ready and plays; seeking works (FR-VID-02/05).
// The worker runs the deterministic fake yt-dlp (e2e/compose.e2e.yml): no real platform is used.
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { ADMIN } from '../support/api';

test('a pasted link is fetched, processed and plays with seeking', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('link', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Send a video' })).toBeVisible();
  await expectAccessible(page, '/send');

  await page.getByLabel('Video link').fill(`https://www.youtube.com/watch?v=ok&e2e=${Date.now()}`);
  const mediaResponses: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/media-store/media/')) mediaResponses.push(r.status());
  });
  await page.getByRole('button', { name: 'Add video' }).click();

  await expect(page.getByTestId('video-state')).toHaveAttribute('data-state', 'ready', {
    timeout: 90_000,
  });
  const player = page.getByTestId('preview-player');
  await expect(player).toBeVisible();
  await expectAccessible(page, 'send preview');

  // The presigned media URL supports Range through Caddy (BR-MED-7, L-10), in every browser.
  const src = await player.getAttribute('src');
  const range = await page.evaluate(async (url) => {
    const r = await fetch(url as string, { headers: { Range: 'bytes=100-199' } });
    return { status: r.status, length: (await r.arrayBuffer()).byteLength };
  }, src);
  expect(range).toEqual({ status: 206, length: 100 });

  const canPlay = await player.evaluate((v: HTMLVideoElement) =>
    v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
  );
  test.skip(!canPlay, 'this browser build has no H.264/AAC decoder (CI uses branded Chrome)');
  // Plays…
  await player.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
  });
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0.3);
  // …and seeks, which needs HTTP Range through Caddy to the store (BR-MED-7, L-10).
  await player.evaluate((v: HTMLVideoElement) => {
    v.pause();
    v.currentTime = 3;
  });
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => (v.seeking ? -1 : v.currentTime)), {
      timeout: 15_000,
    })
    .toBeGreaterThan(2.5);
  expect(mediaResponses).toContain(206);
});
