// Mobile push (FR-NOTIF-03, ADR-0011): Expo push token registered as a push target; tapping a
// notification opens the share. Tokens need the build's EAS project id; builds without one (for
// example local development builds) simply skip push and keep the in-app list.
import { createPushTarget, deletePushTarget } from '@vidfriends/contracts';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { ApiClient } from '@vidfriends/api-client';
import { pushTarget } from '@/lib/push-target';
import { useSession } from '@/lib/session';

const TARGET_KEY = 'vf.pushTarget';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export type PushStatus = 'enabled' | 'denied' | 'unavailable' | 'off';

export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'denied') return 'denied';
  return (await SecureStore.getItemAsync(TARGET_KEY)) ? 'enabled' : 'off';
}

export async function enablePush(api: ApiClient, privatePreviews: boolean): Promise<PushStatus> {
  const id = projectId();
  if (!Device.isDevice || !id) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'VidFriends',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  const { target } = await api.call(createPushTarget, {
    body: { kind: 'expo', endpoint: token, private_previews: privatePreviews },
  });
  await SecureStore.setItemAsync(TARGET_KEY, target.id);
  return 'enabled';
}

export async function disablePush(api: ApiClient): Promise<void> {
  const id = await SecureStore.getItemAsync(TARGET_KEY);
  if (id) await api.call(deletePushTarget, { params: { id } }).catch(() => {});
  await SecureStore.deleteItemAsync(TARGET_KEY);
}

/** Opens the share a tapped notification points at (only ids travel in pushes, BR-NOT-3). */
export function PushRegistration() {
  const { signedIn } = useSession();
  useEffect(() => {
    if (!signedIn) return;
    const open = (data: Record<string, unknown> | undefined) => {
      const target = pushTarget(data);
      if (target.kind === 'share')
        router.push({ pathname: '/share/[id]', params: { id: target.id } });
      else if (target.kind === 'friends') router.push('/(tabs)/friends');
      else if (target.kind === 'inbox') router.push('/(tabs)/inbox');
      else router.push('/notifications');
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, [signedIn]);
  return null;
}
