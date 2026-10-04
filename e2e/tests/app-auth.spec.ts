// M7-T6 / WF-AUTH-5: the page the app opens in the browser signs in or joins with a passkey and
// hands a PKCE-bound code back to vidfriends://auth; the web session it created ends (ADR-0018).
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { Api } from '../support/api';
import { authenticator, usePasskeys } from '../support/passkeys';
import { person } from '../support/people';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(16).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, state, challenge };
}

/** Reads the hand-off code from the page's return link and exchanges it like the app does. */
async function exchange(page: Page, baseURL: string, p: ReturnType<typeof pkce>) {
  const link = page.getByRole('link', { name: 'Return to the app' });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!;
  expect(href.startsWith('vidfriends://auth?')).toBe(true);
  const params = new URL(href).searchParams;
  expect(params.get('state')).toBe(p.state);
  const app = await Api.create(baseURL);
  const { token, user } = await app.post<{ token: string; user: { username: string } }>(
    '/auth/mobile/token',
    { code: params.get('code'), code_verifier: p.verifier },
  );
  // Single use: the same code cannot be exchanged again.
  await expect(
    app.post('/auth/mobile/token', { code: params.get('code'), code_verifier: p.verifier }),
  ).rejects.toThrow(/400/);
  const me = await app.ctx.get('/api/v1/me', { headers: { authorization: `Bearer ${token}` } });
  expect(me.ok()).toBe(true);
  await app.dispose();
  return user.username;
}

test('the app hand-off signs in with a passkey and returns a code', async ({ page, baseURL }) => {
  const pia = await person(baseURL as string, 'Pia');
  await usePasskeys(page, pia.auth);
  // The app's scheme does not exist in the test browser; stay on the page.
  await page.route('vidfriends://**', (route) => route.abort());
  const p = pkce();
  await page.goto(`/app-auth?mode=signin&state=${p.state}&code_challenge=${p.challenge}`);
  await expect(page.getByRole('heading', { name: 'Sign in to the app' })).toBeVisible();
  await expectAccessible(page, '/app-auth');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  expect(await exchange(page, baseURL as string, p)).toBe(pia.username);

  // The web session made only for the hand-off was signed out again.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await pia.api.dispose();
});

test('the app hand-off joins through an invite', async ({ page, baseURL }) => {
  const admin = await Api.admin(baseURL as string);
  const { code } = await admin.createInvite({ auto_friend: true });
  await usePasskeys(page, authenticator(baseURL as string));
  await page.route('vidfriends://**', (route) => route.abort());
  const p = pkce();
  await page.goto(
    `/app-auth?mode=join&invite=${code}&state=${p.state}&code_challenge=${p.challenge}`,
  );
  await expect(page.getByRole('heading', { name: 'Join The Smiths' })).toBeVisible();
  const username = `ola${Date.now() % 100000}`;
  await page.getByLabel('Display name').fill('Ola');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Create account' }).click();
  expect(await exchange(page, baseURL as string, p)).toBe(username);
  await admin.dispose();
});

test('an incomplete hand-off link is refused', async ({ page }) => {
  await page.goto('/app-auth?mode=signin&state=short');
  await expect(page.getByRole('alert')).toContainText('This sign-in link is incomplete');
});
