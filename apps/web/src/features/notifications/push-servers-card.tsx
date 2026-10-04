// ntfy and Gotify push targets (FR-NOTIF-07, BR-NOT-8, ADR-0020): add, test and remove them.
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@vidfriends/api-client';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import {
  createPushTarget,
  deletePushTarget,
  listPushTargets,
  testPushTarget,
  type PushTarget,
} from '@vidfriends/contracts';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatRelative } from '@/i18n';
import { errorMessage, fieldMessage } from '@/lib/errors';

type Kind = 'ntfy' | 'gotify';

export function PushServersCard() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const targets = useApiQuery(listPushTargets);
  const [kind, setKind] = useState<Kind>('ntfy');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [privatePreviews, setPrivatePreviews] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [listPushTargets.id] });
  const items = (targets.data?.items ?? []).filter(
    (p): p is PushTarget & { kind: Kind } => p.kind === 'ntfy' || p.kind === 'gotify',
  );

  async function add(e: FormEvent) {
    e.preventDefault();
    setFields({});
    setError(null);
    setBusy(true);
    try {
      await api.call(createPushTarget, {
        body: {
          kind,
          endpoint: endpoint.trim(),
          ...(token.trim() ? { token: token.trim() } : {}),
          private_previews: privatePreviews,
        },
      });
      setEndpoint('');
      setToken('');
      toast.success(t('pushServers.added'));
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') setFields(err.fields);
      else setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    try {
      const { result } = await api.call(testPushTarget, { params: { id }, body: {} });
      if (result === 'ok') toast.success(t('pushServers.testOk'));
      else toast.error(t(result === 'gone' ? 'pushServers.testGone' : 'pushServers.testFailed'));
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
    await refresh();
  }

  async function remove(id: string) {
    try {
      await api.call(deletePushTarget, { params: { id } });
      toast.success(t('pushServers.removed'));
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
    await refresh();
  }

  return (
    <Card className="grid gap-4">
      <CardTitle>{t('pushServers.title')}</CardTitle>
      <CardDescription>{t('pushServers.help')}</CardDescription>
      {items.length > 0 && (
        <ul className="grid gap-2" aria-label={t('pushServers.title')}>
          {items.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="grid gap-0.5">
                <span className="font-medium">
                  {t(`pushServers.kinds.${p.kind}`)} · {p.label}
                </span>
                <span className="text-muted-foreground">
                  {p.last_success_at
                    ? t('pushServers.lastSuccess', { when: formatRelative(p.last_success_at) })
                    : t('pushServers.neverDelivered')}
                  {p.private_previews && ` · ${t('pushServers.private')}`}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void test(p.id)}>
                  {t('pushServers.test')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void remove(p.id)}>
                  {t('pushServers.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-3" onSubmit={(e) => void add(e)} noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="grid gap-1.5">
          <Label htmlFor="push-server-kind">{t('pushServers.kind')}</Label>
          <select
            id="push-server-kind"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="ntfy">{t('pushServers.kinds.ntfy')}</option>
            <option value="gotify">{t('pushServers.kinds.gotify')}</option>
          </select>
        </div>
        <Field
          label={t(kind === 'ntfy' ? 'pushServers.topicUrl' : 'pushServers.serverUrl')}
          help={t(kind === 'ntfy' ? 'pushServers.topicHelp' : 'pushServers.serverHelp')}
          error={fieldMessage(t, fields.endpoint)}
        >
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://"
          />
        </Field>
        <Field
          label={t(kind === 'ntfy' ? 'pushServers.ntfyToken' : 'pushServers.gotifyToken')}
          help={t(kind === 'ntfy' ? 'pushServers.ntfyTokenHelp' : 'pushServers.gotifyTokenHelp')}
          error={fieldMessage(t, fields.token)}
        >
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-3">
          <Switch
            id="push-server-private"
            checked={privatePreviews}
            onCheckedChange={setPrivatePreviews}
          />
          <Label htmlFor="push-server-private">{t('push.privatePreviews')}</Label>
        </div>
        <div>
          <Button type="submit" disabled={busy || !endpoint.trim()}>
            {t('pushServers.add')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
