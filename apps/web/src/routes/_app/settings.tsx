import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import {
  AVATAR_MAX_BYTES,
  changePassword,
  createAvatarUpload,
  deleteAvatar,
  deleteMe,
  listSessions,
  revokeSessionRoute,
  type Session,
  DisplayName,
  logout,
  Password,
  setAvatar,
  updateMe,
} from '@vidfriends/contracts';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatRelative } from '@/i18n';
import { PushCard } from '@/features/notifications/push-card';
import { Input } from '@/components/ui/input';
import { meQuery } from '@/lib/session';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput } from '@/components/password-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { applyApiError, errorMessage, fieldMessage } from '@/lib/errors';
import { getTheme, setTheme, type Theme } from '@/lib/theme';

const schema = z
  .object({
    current_password: z.string().min(1, 'required'),
    new_password: Password,
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'password_mismatch' });
type Values = z.infer<typeof schema>;

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
      <PasswordCard />
      <SessionsCard />
      <AppearanceCard />
      <DeleteAccountCard />
    </div>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const mutation = useApiMutation(changePassword, {
    onSuccess: () => {
      form.reset({ current_password: '', new_password: '', confirm: '' });
      toast.success(t('settings.passwordChanged'));
    },
    onError: (err) => {
      if ((err as { code?: string }).code === 'invalid_credentials') {
        form.setError('current_password', { message: 'invalid' });
        setFormError(errorMessage(t, err));
        return;
      }
      setFormError(applyApiError(t, err, form.setError, ['current_password', 'new_password']));
    },
  });
  const err = form.formState.errors;
  return (
    <Card>
      <CardTitle className="mb-4">{t('settings.passwordTitle')}</CardTitle>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit((v) => {
          setFormError(null);
          mutation.mutate({
            body: { current_password: v.current_password, new_password: v.new_password },
          });
        })}
      >
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <Field
          label={t('settings.currentPassword')}
          error={fieldMessage(t, err.current_password?.message)}
        >
          <PasswordInput autoComplete="current-password" {...form.register('current_password')} />
        </Field>
        <Field label={t('settings.newPassword')} error={fieldMessage(t, err.new_password?.message)}>
          <PasswordInput autoComplete="new-password" {...form.register('new_password')} />
        </Field>
        <Field label={t('settings.confirmPassword')} error={fieldMessage(t, err.confirm?.message)}>
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <div>
          <Button type="submit" disabled={mutation.isPending}>
            {t('settings.passwordSubmit')}
          </Button>
        </div>
      </form>
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

function DeleteAccountCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const mutation = useApiMutation(deleteMe, {
    onSuccess: async () => {
      queryClient.clear();
      toast.success(t('settings.deleted'));
      await navigate({ to: '/login' });
    },
  });
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
          if (!o) {
            setPassword('');
            mutation.reset();
          }
        }}
        title={t('settings.deleteTitle')}
        description={t('settings.deleteConfirm')}
        confirmLabel={t('settings.deleteSubmit')}
        pending={mutation.isPending || !password}
        onConfirm={() => mutation.mutate({ body: { password } })}
      >
        {mutation.isError && <Alert variant="destructive">{errorMessage(t, mutation.error)}</Alert>}
        <Field label={t('settings.currentPassword')}>
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

function AppearanceCard() {
  const { t } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(getTheme());
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
    </Card>
  );
}

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
