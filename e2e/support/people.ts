// Seeds members and friendships through the public API (TDD §7).
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ADMIN, Api, PASSWORD } from './api';

export interface Person {
  api: Api;
  id: string;
  username: string;
  name: string;
}

export async function person(baseURL: string, name: string): Promise<Person> {
  const admin = await Api.create(baseURL);
  await admin.login(ADMIN.username, ADMIN.password);
  const { code } = await admin.createInvite({ auto_friend: false });
  await admin.dispose();
  const api = await Api.create(baseURL);
  const username = `${name.toLowerCase()}${Date.now() % 1_000_000}${Math.floor(Math.random() * 100)}`;
  const { user } = await api.register(code, username, name);
  return { api, id: user.id, username, name };
}

export async function befriend(a: Person, b: Person) {
  await a.api.post('/friends/requests', { user_id: b.id });
  await b.api.post(`/friends/requests/${a.id}/accept`);
}

export async function loginPage(page: Page, p: Person) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(p.username);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}
