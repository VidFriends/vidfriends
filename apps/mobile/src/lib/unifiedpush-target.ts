// The server side of this phone's UnifiedPush registration (FR-NOTIF-08, ADR-0024).
import type { ApiClient } from '@vidfriends/api-client';
import { createPushTarget, deletePushTarget } from '@vidfriends/contracts';
import * as SecureStore from 'expo-secure-store';

const TARGET_KEY = 'vf.upTarget';

export interface UpEndpoint {
  url: string;
  p256dh: string;
  auth: string;
}

/** Saves (or replaces) this phone's endpoint as a push target; a replaced one is deleted. */
export async function saveEndpoint(api: ApiClient, e: UpEndpoint): Promise<void> {
  const previous = await SecureStore.getItemAsync(TARGET_KEY);
  const { target } = await api.call(createPushTarget, {
    body: { kind: 'unifiedpush', endpoint: e.url, keys: { p256dh: e.p256dh, auth: e.auth } },
  });
  if (previous && previous !== target.id)
    await api.call(deletePushTarget, { params: { id: previous } }).catch(() => {});
  await SecureStore.setItemAsync(TARGET_KEY, target.id);
}

export async function forgetTarget(api: ApiClient): Promise<void> {
  const id = await SecureStore.getItemAsync(TARGET_KEY);
  if (id) await api.call(deletePushTarget, { params: { id } }).catch(() => {});
  await SecureStore.deleteItemAsync(TARGET_KEY);
}

export function savedTargetId(): Promise<string | null> {
  return SecureStore.getItemAsync(TARGET_KEY);
}
