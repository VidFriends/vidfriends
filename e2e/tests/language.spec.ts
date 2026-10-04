// M7-T14 / NFR-I18N-01: a Spanish browser gets the Spanish UI; Settings switches the language for
// this browser and back to following the browser.
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { usePasskeys } from '../support/passkeys';
import { person } from '../support/people';

test.use({ locale: 'es-ES' });

test('follows the browser language and can be switched in Settings', async ({ page, baseURL }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expectAccessible(page, '/login (es)');

  const ana = await person(baseURL!, 'Ana');
  await usePasskeys(page, ana.auth);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Iniciar sesión con una llave de acceso' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible();
  await page.getByLabel('Idioma').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  await page.getByLabel('Language').selectOption('system');
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible();
  await ana.api.dispose();
});
