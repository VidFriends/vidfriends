// FR-NOTIF-08 (ADR-0024): the phone's UnifiedPush endpoint is saved once and replaced cleanly.
import { createPushTarget, deletePushTarget } from '@vidfriends/contracts';
import type { ApiClient } from '@vidfriends/api-client';
import { forgetTarget, saveEndpoint, savedTargetId } from './unifiedpush-target';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

function fakeApi(ids: string[]) {
  const calls: { route: string; options: unknown }[] = [];
  const api = {
    call: jest.fn(async (route: { id: string }, options: unknown) => {
      calls.push({ route: route.id, options });
      if (route.id === createPushTarget.id) return { target: { id: ids.shift() } };
      return undefined;
    }),
  } as unknown as ApiClient;
  return { api, calls };
}

const endpoint = { url: 'https://ntfy.example/upAbc?up=1', p256dh: 'pk', auth: 'au' };

beforeEach(() => mockStore.clear());

test('saves the endpoint with its Web Push keys and remembers the target', async () => {
  const { api, calls } = fakeApi(['t1']);
  await saveEndpoint(api, endpoint);
  expect(calls).toEqual([
    {
      route: createPushTarget.id,
      options: {
        body: {
          kind: 'unifiedpush',
          endpoint: endpoint.url,
          keys: { p256dh: 'pk', auth: 'au' },
        },
      },
    },
  ]);
  expect(await savedTargetId()).toBe('t1');
});

test('a new endpoint replaces the old target, and turning off deletes it', async () => {
  const { api, calls } = fakeApi(['t1', 't2']);
  await saveEndpoint(api, endpoint);
  await saveEndpoint(api, { ...endpoint, url: 'https://ntfy.example/upNew?up=1' });
  expect(calls.map((c) => c.route)).toEqual([
    createPushTarget.id,
    createPushTarget.id,
    deletePushTarget.id,
  ]);
  expect(calls[2]!.options).toEqual({ params: { id: 't1' } });
  await forgetTarget(api);
  expect(calls[3]).toEqual({ route: deletePushTarget.id, options: { params: { id: 't2' } } });
  expect(await savedTargetId()).toBeNull();
});
