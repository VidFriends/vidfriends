// Web Push opt-in and per-type preferences (FR-NOTIF-02/04, BR-NOT-2/3).
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import {
  createPushTarget,
  deletePushTarget,
  getNotificationPrefs,
  getVapidKey,
  NOTIFICATION_TYPES,
  putNotificationPrefs,
} from '@vidfriends/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/errors';

const TARGET_KEY = 'vf-push-target';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function PushCard() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const prefs = useApiQuery(getNotificationPrefs);
  const savePrefs = useApiMutation(putNotificationPrefs, {
    onSuccess: (data) => queryClient.setQueryData([getNotificationPrefs.id, null, null], data),
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  const [subscribed, setSubscribed] = useState(false);
  const [privatePreviews, setPrivatePreviews] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported()) return;
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    });
  }, []);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError(t('push.denied'));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api.call(getVapidKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { target } = await api.call(createPushTarget, {
        body: {
          kind: 'webpush',
          endpoint: json.endpoint,
          keys: json.keys,
          private_previews: privatePreviews,
        },
      });
      try {
        localStorage.setItem(TARGET_KEY, target.id);
      } catch {
        // only used to unregister later
      }
      setSubscribed(true);
      toast.success(t('push.enabled'));
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      const id = localStorage.getItem(TARGET_KEY);
      if (id) await api.call(deletePushTarget, { params: { id } }).catch(() => undefined);
      localStorage.removeItem(TARGET_KEY);
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="grid gap-4">
      <CardTitle>{t('push.title')}</CardTitle>
      <CardDescription>{t('push.help')}</CardDescription>
      {error && <Alert variant="destructive">{error}</Alert>}
      {!supported() ? (
        <p className="text-sm text-muted-foreground">{t('push.unsupported')}</p>
      ) : subscribed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{t('push.enabled')}</p>
          <Button variant="outline" onClick={() => void disable()} disabled={busy}>
            {t('push.disable')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <Switch
              id="private-previews"
              checked={privatePreviews}
              onCheckedChange={setPrivatePreviews}
            />
            <Label htmlFor="private-previews">{t('push.privatePreviews')}</Label>
          </div>
          <div>
            <Button onClick={() => void enable()} disabled={busy}>
              {t('push.enable')}
            </Button>
          </div>
        </div>
      )}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t('push.prefsTitle')}</legend>
        {NOTIFICATION_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-3">
            <Switch
              id={`pref-${type}`}
              checked={prefs.data?.push[type] ?? false}
              disabled={!prefs.data}
              onCheckedChange={(v) => savePrefs.mutate({ body: { push: { [type]: v } } })}
            />
            <Label htmlFor={`pref-${type}`}>{t(`push.types.${type}`)}</Label>
          </div>
        ))}
      </fieldset>
    </Card>
  );
}
