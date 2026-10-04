// Seeds members and friendships through the public API (TDD §7).
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { SoftAuthenticator } from '@vidfriends/test-utils/authenticator';
import { Api } from './api';
import { authenticator, usePasskeys } from './passkeys';

export interface Person {
  api: Api;
  /** The person's passkey, also used when they sign in through a page. */
  auth: SoftAuthenticator;
  id: string;
  username: string;
  name: string;
}

export async function person(baseURL: string, name: string): Promise<Person> {
  const admin = await Api.admin(baseURL);
  const { code } = await admin.createInvite({ auto_friend: false });
  await admin.dispose();
  const api = await Api.create(baseURL);
  const username = `${name.toLowerCase()}${Date.now() % 1_000_000}${Math.floor(Math.random() * 100)}`;
  const auth = authenticator(baseURL);
  const { user } = await api.register(code, username, name, auth);
  return { api, auth, id: user.id, username, name };
}

export async function befriend(a: Person, b: Person) {
  await a.api.post('/friends/requests', { user_id: b.id });
  await b.api.post(`/friends/requests/${a.id}/accept`);
}

/** Signs in through the login page with the person's passkey. */
export async function loginPage(page: Page, p: { auth: SoftAuthenticator }) {
  await usePasskeys(page, p.auth);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}
