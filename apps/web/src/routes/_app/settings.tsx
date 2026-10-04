import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import { changePassword, logout, Password } from '@vidfriends/contracts';
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
      <PasswordCard />
      <SessionsCard />
      <AppearanceCard />
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
  const mutation = useApiMutation(logout, {
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('settings.sessionsTitle')}</CardTitle>
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
