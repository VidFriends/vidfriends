// M7-T11 / FR-NOTIF-07 (ADR-0020): a member adds an ntfy topic, sends a test push through the
// server's egress guard (to the operator-listed fake ntfy host) and removes it.
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { loginPage, person } from '../support/people';

test('member adds, tests and removes an ntfy target', async ({ page, baseURL }) => {
  const kim = await person(baseURL!, 'Kim');
  await loginPage(page, kim);
  await page.goto('/settings');
  await page.getByLabel('Service').selectOption('ntfy');
  await page.getByLabel('Topic URL').fill('https://10.0.0.1/topic');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Use an https:// address on the internet.')).toBeVisible();

  await page.getByLabel('Topic URL').fill('http://fake-ntfy:8090/e2e-topic');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const list = page.getByRole('list', { name: 'ntfy and Gotify' });
  await expect(list).toContainText('fake-ntfy:8090/e2e-topic');
  await expect(list).toContainText('Nothing delivered yet');
  // Toasts fade in and out; check the settled page.
  await expect(page.getByText('Added. Send a test to check it works.')).toHaveCount(0, {
    timeout: 10_000,
  });
  await expectAccessible(page, '/settings (push servers)');

  await list.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByText('Test notification sent.')).toBeVisible();
  await expect(list).toContainText('Last delivered');

  await list.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('list', { name: 'ntfy and Gotify' })).toHaveCount(0);
  await kim.api.dispose();
});
