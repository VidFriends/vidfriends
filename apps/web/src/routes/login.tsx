import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import { login } from '@vidfriends/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { PasswordInput } from '@/components/password-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage, fieldMessage } from '@/lib/errors';
import { instanceQuery } from '@/lib/session';

const schema = z.object({
  username: z.string().trim().min(1, 'required'),
  password: z.string().min(1, 'required'),
});
type Values = z.infer<typeof schema>;

const search = z.object({
  redirect: z.string().optional().catch(undefined),
  expired: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: search,
  loader: async ({ context }) => {
    const instance = await context.queryClient.ensureQueryData(instanceQuery());
    if (!instance.setup_complete) throw redirect({ to: '/setup' });
    return instance;
  },
  component: LoginPage,
});

/** Only same-app relative paths are allowed as post-login targets (no open redirect). */
function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/';
  return target;
}

function LoginPage() {
  const { t } = useTranslation();
  const instance = Route.useLoaderData();
  const { redirect: target, expired } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const mutation = useApiMutation(login, {
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: safeRedirect(target) });
    },
    onError: (err) => setFormError(errorMessage(t, err)),
  });
  const err = form.formState.errors;
  return (
    <AuthShell title={t('login.title')} subtitle={t('login.subtitle', { name: instance.name })}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit((v) => {
          setFormError(null);
          mutation.mutate({ body: { ...v, client: 'web' } });
        })}
      >
        {expired && !formError && <Alert>{t('login.expired')}</Alert>}
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <Field label={t('login.username')} error={fieldMessage(t, err.username?.message)}>
          <Input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register('username')}
          />
        </Field>
        <Field label={t('login.password')} error={fieldMessage(t, err.password?.message)}>
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </Field>
        <Button type="submit" disabled={mutation.isPending}>
          {t('login.submit')}
        </Button>
        <p className="text-sm text-muted-foreground">{t('login.noAccount')}</p>
      </form>
    </AuthShell>
  );
}
