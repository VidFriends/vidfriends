// UnifiedPush on Android (FR-NOTIF-08, ADR-0024): the member picks a distributor app (for example
// ntfy); its endpoint and Web Push keys are saved on the server as a push target, and the native
// service shows incoming pushes. While it is on, Expo push is off so pushes are not doubled.
import { getVapidKey } from '@vidfriends/contracts';
import type { ApiClient } from '@vidfriends/api-client';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import * as UP from '../../modules/vidfriends-unifiedpush';
import { disablePush } from '@/features/push';
import { errorText } from '@/i18n';
import { forgetTarget, saveEndpoint, savedTargetId } from '@/lib/unifiedpush-target';
import { useSession } from '@/lib/session';
import { Body, Button, Card, ErrorBox, Title } from '@/ui/kit';

export const unifiedPushAvailable = UP.available;

/** Turns UnifiedPush off on this phone and on the server (also on sign-out). */
export async function disableUnifiedPush(api: ApiClient): Promise<void> {
  if (!UP.available) return;
  UP.unregister();
  await forgetTarget(api);
}

/** Keeps the server in step with the distributor while signed in. */
export function UnifiedPushSync() {
  const { signedIn, api } = useSession();
  useEffect(() => {
    if (!signedIn || !UP.available) return;
    const endpoint = UP.getEndpoint();
    if (UP.getDistributor() && endpoint) {
      void savedTargetId().then((id) =>
        id ? undefined : saveEndpoint(api, endpoint).catch(() => {}),
      );
    }
    const subs = [
      UP.addEndpointListener((e) => void saveEndpoint(api, e).catch(() => {})),
      UP.addUnregisteredListener(() => void forgetTarget(api)),
    ];
    return () => subs.forEach((s) => s?.remove());
  }, [signedIn, api]);
  return null;
}

/** Settings card: pick a distributor, or turn UnifiedPush off. Android builds only. */
export function UnifiedPushCard({ onEnabled }: { onEnabled?: () => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [distributors] = useState(() => UP.getDistributors());
  const [current, setCurrent] = useState(() => UP.getDistributor());
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const subs = [
      UP.addEndpointListener(() => setWaiting(false)),
      UP.addFailedListener(() => {
        setWaiting(false);
        setCurrent(null);
        setError(t('unifiedpush.failed'));
      }),
      UP.addUnregisteredListener(() => setCurrent(null)),
    ];
    return () => subs.forEach((s) => s?.remove());
  }, [t]);
  if (!UP.available) return null;

  async function use(id: string) {
    setError(null);
    try {
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') {
        setError(t('settings.pushDenied'));
        return;
      }
      const { key } = await api.call(getVapidKey);
      // One push channel per phone: Expo push stops while UnifiedPush is on.
      await disablePush(api);
      UP.register(id, key);
      setCurrent(id);
      setWaiting(true);
      onEnabled?.();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function off() {
    setError(null);
    await disableUnifiedPush(api);
    setCurrent(null);
    setWaiting(false);
  }

  const name = (id: string | null) => distributors.find((d) => d.id === id)?.name ?? id ?? '';
  return (
    <Card>
      <Title>{t('unifiedpush.title')}</Title>
      <Body muted>{t('unifiedpush.help')}</Body>
      <ErrorBox message={error} />
      {current ? (
        <>
          <Body testID="unifiedpush-status">
            {waiting
              ? t('unifiedpush.waiting', { name: name(current) })
              : t('unifiedpush.on', { name: name(current) })}
          </Body>
          <Button
            label={t('unifiedpush.off')}
            variant="secondary"
            testID="unifiedpush-off"
            onPress={() => void off()}
          />
        </>
      ) : distributors.length ? (
        <View style={{ gap: 8 }}>
          {distributors.map((d) => (
            <Button
              key={d.id}
              label={t('unifiedpush.use', { name: d.name })}
              variant="secondary"
              testID={`unifiedpush-use-${d.id}`}
              onPress={() => void use(d.id)}
            />
          ))}
        </View>
      ) : (
        <Body muted testID="unifiedpush-none">
          {t('unifiedpush.none')}
        </Body>
      )}
    </Card>
  );
}
