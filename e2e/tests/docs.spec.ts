// M5-T8: the privacy disclosure and member help are reachable before and after login, reflect this
// server's settings, and pass the accessibility scan.
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { loginPage, person } from '../support/people';

test('privacy and help pages are linked from login and settings', async ({ page, baseURL }) => {
  await page.goto('/login');
  const footer = page.getByRole('navigation', { name: 'About this server' });
  await footer.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Privacy on / })).toBeVisible();
  // The operator-access disclosure (ADR-0016) and this server's retention period.
  await expect(page.getByText('they can technically access everything stored on it')).toBeVisible();
  await expect(page.getByText('(90 days on this server)')).toBeVisible();
  await expectAccessible(page, '/privacy');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page
    .getByRole('navigation', { name: 'About this server' })
    .getByRole('link', { name: 'Help' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'How VidFriends works' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Watching' })).toBeVisible();
  await expectAccessible(page, '/help');

  const member = await person(baseURL as string, 'Pia');
  await loginPage(page, member);
  await page.goto('/settings');
  await page
    .getByRole('navigation', { name: 'About this server' })
    .getByRole('link', { name: 'Privacy' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /^Privacy on / })).toBeVisible();
  await member.api.dispose();
});
