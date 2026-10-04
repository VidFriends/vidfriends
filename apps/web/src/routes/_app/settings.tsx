import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import {
  AVATAR_MAX_BYTES,
  addPasskey,
  addPasskeyOptions,
  createExport,
  type DataExport,
  createAvatarUpload,
  deleteAvatar,
  deleteMe,
  listExports,
  listPasskeys,
  type Passkey,
  reauth,
  reauthOptions,
  removePasskey,
  renamePasskey,
  listSessions,
  revokeSessionRoute,
  type Session,
  DisplayName,
  logout,
  setAvatar,
  updateMe,
} from '@vidfriends/contracts';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SiteFooter } from '@/components/info-page';
import {
  formatBytes,
  formatRelative,
  LANGUAGES,
  setLanguage,
  storedLanguage,
  type Language,
} from '@/i18n';
import { Label } from '@/components/ui/label';
import { PushCard } from '@/features/notifications/push-card';
import { PushServersCard } from '@/features/notifications/push-servers-card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { meQuery } from '@/lib/session';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { assertPasskey, createPasskey, passkeyErrorMessage } from '@/lib/passkeys';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { errorMessage, fieldMessage } from '@/lib/errors';
import { getTheme, setTheme, type Theme } from '@/lib/theme';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      <ProfileCard />
      <PushCard />
      <PushServersCard />
      <PasskeysCard />
      <SessionsCard />
      <AppearanceCard />
      <ExportCard />
      <DeleteAccountCard />
      <SiteFooter />
    </div>
  );
}

/** Confirms with one of the member's passkeys; sensitive actions are allowed for 5 minutes. */
async function confirmWithPasskey() {
  await assertPasskey(
    () => api.call(reauthOptions, { body: {} }),
    (ceremony_id, credential) => api.call(reauth, { body: { ceremony_id, credential } }),
  );
}

/** FR-ACCT-02 / WF-ACCT-2: list, add, rename and remove passkeys. */
function PasskeysCard() {
  const { t } = useTranslation();
  const queryClient = Route.useRouteContext().queryClient;
  const passkeys = useApiQuery(listPasskeys);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<Passkey | null>(null);
  const [name, setName] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: [listPasskeys.id] });

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (err) {
      toast.error(passkeyErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(
      () =>
        createPasskey(
          () => api.call(addPasskeyOptions, { body: {} }),
          (ceremony_id, credential) => api.call(addPasskey, { body: { ceremony_id, credential } }),
        ),
      t('passkeys.added'),
    );
  const remove = (p: Passkey) =>
    run(async () => {
      await confirmWithPasskey();
      await api.call(removePasskey, { params: { id: p.id } });
    }, t('passkeys.removed'));
  const items = (passkeys.data?.items ?? []) as Passkey[];

  return (
    <Card className="grid gap-3">
      <CardTitle>{t('passkeys.title')}</CardTitle>
      <CardDescription>{t('passkeys.help')}</CardDescription>
      {passkeys.isError && <Alert variant="destructive">{errorMessage(t, passkeys.error)}</Alert>}
      <ul className="grid gap-2" aria-label={t('passkeys.title')}>
        {items.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          >
            <div className="grid gap-0.5">
              <span className="font-medium">
                {p.name}
                {p.current && ` · ${t('passkeys.current')}`}
              </span>
              <span className="text-muted-foreground">
                {p.last_used_at
                  ? t('passkeys.lastUsed', { when: formatRelative(p.last_used_at) })
                  : t('passkeys.created', { when: formatRelative(p.created_at) })}
                {p.backed_up && ` · ${t('passkeys.synced')}`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setRenaming(p);
                  setName(p.name);
                }}
              >
                {t('passkeys.rename')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || items.length < 2}
                onClick={() => void remove(p)}
              >
                {t('passkeys.remove')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 1 && <CardDescription>{t('passkeys.addAnother')}</CardDescription>}
      <div>
        <Button variant="outline" disabled={busy} onClick={() => void add()}>
          {t('passkeys.add')}
        </Button>
      </div>
      <ConfirmDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title={t('passkeys.rename')}
        description={t('passkeys.renameHelp')}
        confirmLabel={t('passkeys.save')}
        pending={busy || !name.trim()}
        onConfirm={() => {
          const target = renaming;
          setRenaming(null);
          if (target)
            void run(
              () =>
                api.call(renamePasskey, { params: { id: target.id }, body: { name: name.trim() } }),
              t('passkeys.renamed'),
            );
        }}
      >
        <Field label={t('passkeys.name')}>
          <Input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

function SessionsCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const sessions = useApiQuery(listSessions);
  const mutation = useApiMutation(logout, {
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
  const revoke = useApiMutation(revokeSessionRoute, {
    onSuccess: async () => {
      toast.success(t('settings.sessionRevoked'));
      await queryClient.invalidateQueries({ queryKey: [listSessions.id] });
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('settings.sessionsTitle')}</CardTitle>
      <CardDescription>{t('settings.sessionsHelp')}</CardDescription>
      {sessions.isError && <Alert variant="destructive">{errorMessage(t, sessions.error)}</Alert>}
      {sessions.data && (
        <ul className="grid gap-2" aria-label={t('settings.sessionsTitle')}>
          {(sessions.data.items as Session[]).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="grid gap-0.5 text-sm">
                <span className="font-medium">
                  {s.client === 'web' ? t('settings.sessionWeb') : t('settings.sessionMobile')}
                  {s.current && ` · ${t('settings.sessionCurrent')}`}
                </span>
                <span className="break-all text-muted-foreground">{s.user_agent}</span>
                <span className="text-muted-foreground">
                  {t('settings.sessionSeen', { when: formatRelative(s.last_seen_at) })}
                </span>
              </div>
              {!s.current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ params: { id: s.id } })}
                >
                  {t('settings.sessionRevoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CardDescription>{t('settings.logoutEverywhereHelp')}</CardDescription>
      <div>
        <Button
          variant="destructive"
          onClick={() => mutation.mutate({ body: { all: true } })}
          disabled={mutation.isPending}
        >
          {t('settings.logoutEverywhere')}
        </Button>
      </div>
    </Card>
  );
}

/** FR-ACCT-05 / WF-ACCT-4: download a copy of my data. */
function ExportCard() {
  const { t } = useTranslation();
  const queryClient = Route.useRouteContext().queryClient;
  const [includeMedia, setIncludeMedia] = useState(false);
  const exports = useApiQuery(
    listExports,
    {},
    {
      // Poll while an export is being prepared.
      refetchInterval: (q) =>
        q.state.data?.items.some((e) => e.state === 'queued' || e.state === 'building')
          ? 3000
          : false,
    },
  );
  const request = useApiMutation(createExport, {
    onSuccess: async () => {
      toast.success(t('settings.exportRequested'));
      await queryClient.invalidateQueries({ queryKey: [listExports.id] });
    },
    onError: (err) =>
      toast.error(
        err.code === 'rate_limited' ? t('settings.exportRateLimited') : errorMessage(t, err),
      ),
  });
  const items = (exports.data?.items ?? []) as DataExport[];
  const busy = items.some((e) => e.state === 'queued' || e.state === 'building');
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('settings.exportTitle')}</CardTitle>
      <CardDescription>{t('settings.exportHelp')}</CardDescription>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={includeMedia} onCheckedChange={setIncludeMedia} />
        {t('settings.exportIncludeMedia')}
      </label>
      <div>
        <Button
          variant="outline"
          disabled={busy || request.isPending}
          onClick={() => request.mutate({ body: { include_media: includeMedia } })}
        >
          {t('settings.exportSubmit')}
        </Button>
      </div>
      {exports.isError && <Alert variant="destructive">{errorMessage(t, exports.error)}</Alert>}
      {items.length > 0 && (
        <ul className="grid gap-2" aria-label={t('settings.exportList')}>
          {items.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="grid gap-0.5">
                <span className="font-medium">
                  {t(`settings.exportState.${e.state}`)}
                  {e.include_media && ` · ${t('settings.exportWithMedia')}`}
                  {e.bytes !== null && ` · ${formatBytes(e.bytes)}`}
                </span>
                <span className="text-muted-foreground">
                  {e.state === 'ready' && e.expires_at
                    ? t('settings.exportExpires', { when: formatRelative(e.expires_at) })
                    : t('settings.exportRequestedAt', { when: formatRelative(e.created_at) })}
                </span>
                {e.state === 'failed' && e.error && (
                  <span className="text-destructive">{e.error}</span>
                )}
              </div>
              {e.state === 'ready' && (
                <Button asChild size="sm">
                  <a href={`/api/v1/me/exports/${e.id}/download`}>{t('settings.exportDownload')}</a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DeleteAccountCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function confirmAndDelete() {
    setError(null);
    setPending(true);
    try {
      await confirmWithPasskey();
      await api.call(deleteMe, { body: {} });
      await onDeleted();
    } catch (err) {
      setError(passkeyErrorMessage(t, err));
    } finally {
      setPending(false);
    }
  }
  const onDeleted = async () => {
    queryClient.clear();
    toast.success(t('settings.deleted'));
    await navigate({ to: '/login' });
  };
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('settings.deleteTitle')}</CardTitle>
      <CardDescription>{t('settings.deleteHelp')}</CardDescription>
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t('settings.deleteSubmit')}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title={t('settings.deleteTitle')}
        description={t('settings.deleteConfirm')}
        confirmLabel={t('settings.deleteSubmit')}
        pending={pending}
        onConfirm={() => void confirmAndDelete()}
      >
        {error && <Alert variant="destructive">{error}</Alert>}
      </ConfirmDialog>
    </Card>
  );
}

function AppearanceCard() {
  const { t } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [language, setLanguageState] = useState<Language | null>(storedLanguage());
  const options: Theme[] = ['system', 'light', 'dark'];
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('settings.appearanceTitle')}</CardTitle>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">{t('common.theme')}</legend>
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="theme"
              value={o}
              checked={theme === o}
              onChange={() => {
                setTheme(o);
                setThemeState(o);
              }}
            />
            {t(`common.theme${o[0]?.toUpperCase()}${o.slice(1)}`)}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="language">{t('language.title')}</Label>
        <select
          id="language"
          className="h-9 max-w-xs rounded-md border bg-background px-3 text-sm"
          value={language ?? 'system'}
          onChange={(e) => {
            const v = e.target.value === 'system' ? null : (e.target.value as Language);
            setLanguageState(v);
            void setLanguage(v);
          }}
        >
          <option value="system">{t('language.system')}</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}

/** Each language in its own name, so it can be found whatever the current language is. */
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Español' };

const AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
] as const;

function ProfileCard() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const me = useQuery(meQuery());
  const user = me.data?.user;
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
  const save = useApiMutation(updateMe, {
    onSuccess: async () => {
      toast.success(t('settings.profileSaved'));
      setName(null);
      await refresh();
    },
    onError: (err) => setError(errorMessage(t, err)),
  });
  const parsed = DisplayName.safeParse(name ?? '');
  const fieldErr = name !== null && !parsed.success ? fieldMessage(t, 'too_long') : undefined;

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) return setError(t('errors.too_large'));
    const type = AVATAR_TYPES.find((x) => x === file.type);
    if (!type) return setError(fieldMessage(t, 'not_an_image') ?? null);
    setBusy(true);
    try {
      const slot = await api.call(createAvatarUpload, {
        body: { bytes: file.size, content_type: type },
      });
      const put = await fetch(slot.put_url, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': type },
      });
      if (!put.ok) throw new Error('upload failed');
      await api.call(setAvatar, { body: { upload_id: slot.upload_id } });
      toast.success(t('settings.avatarSaved'));
      await refresh();
    } catch (err) {
      const e = err as { fields?: Record<string, string> };
      setError(
        e.fields?.upload_id ? (fieldMessage(t, e.fields.upload_id) ?? null) : errorMessage(t, err),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  return (
    <Card className="grid gap-4">
      <CardTitle>{t('settings.profileTitle')}</CardTitle>
      <p className="text-sm text-muted-foreground">
        {t('settings.username', { username: user.username })}
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar user={user} size={72} />
        <div className="grid gap-2">
          <span className="text-sm font-medium" id="avatar-label">
            {t('settings.avatar')}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <label aria-disabled={busy}>
                {t('settings.avatarChoose')}
                <input
                  type="file"
                  accept={AVATAR_TYPES.join(',')}
                  className="sr-only"
                  aria-describedby="avatar-help"
                  disabled={busy}
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
            {user.avatar_url && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  await api.call(deleteAvatar);
                  await refresh();
                }}
              >
                {t('settings.avatarRemove')}
              </Button>
            )}
          </div>
          <p id="avatar-help" className="text-xs text-muted-foreground">
            {t('settings.avatarHelp')}
          </p>
        </div>
      </div>
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.success) return;
          setError(null);
          save.mutate({ body: { display_name: parsed.data } });
        }}
      >
        <Field
          label={t('settings.displayName')}
          help={t('settings.displayNameHelp')}
          error={fieldErr}
        >
          <Input
            value={name ?? user.display_name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div>
          <Button type="submit" disabled={save.isPending || name === null}>
            {t('settings.saveProfile')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
