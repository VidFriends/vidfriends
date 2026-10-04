import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { DisplayName, setup, setupOptions, Username } from '@vidfriends/contracts';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError, fieldMessage } from '@/lib/errors';
import { createPasskey, passkeyErrorMessage } from '@/lib/passkeys';
import { ApiError } from '@vidfriends/api-client';
import { instanceQuery } from '@/lib/session';

const schema = z.object({
  setup_token: z.string().trim().min(1, 'required'),
  instance_name: z.string().trim().min(1, 'required').max(60, 'too_long'),
  username: Username,
  display_name: DisplayName,
});
type Values = z.infer<typeof schema>;

export const Route = createFileRoute('/setup')({
  loader: ({ context }) => context.queryClient.ensureQueryData(instanceQuery()),
  component: SetupPage,
});

function SetupPage() {
  const { t } = useTranslation();
  const instance = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { instance_name: 'VidFriends', display_name: '' },
  });
  // WF-AUTH-1: check the token, then create the admin's passkey (ADR-0018).
  const mutation = useMutation({
    mutationFn: (v: Values) =>
      createPasskey(
        () => api.call(setupOptions, { body: v }),
        (ceremony_id, credential) => api.call(setup, { body: { ceremony_id, credential } }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: '/invites' });
    },
    onError: (err) =>
      setFormError(
        err instanceof ApiError
          ? applyApiError(t, err, form.setError, [
              'setup_token',
              'instance_name',
              'username',
              'display_name',
            ])
          : passkeyErrorMessage(t, err),
      ),
  });

  if (instance.setup_complete && !mutation.isSuccess) {
    return (
      <AuthShell title={t('setup.title')}>
        <p className="mb-4">{t('setup.claimed')}</p>
        <Link to="/login" className={buttonVariants()}>
          {t('setup.goLogin')}
        </Link>
      </AuthShell>
    );
  }

  const err = form.formState.errors;
  return (
    <AuthShell title={t('setup.title')} subtitle={t('setup.intro')}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit((v) => {
          setFormError(null);
          mutation.mutate(v);
        })}
      >
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <Field
          label={t('setup.token')}
          help={t('setup.tokenHelp')}
          error={fieldMessage(t, err.setup_token?.message)}
        >
          <Input autoComplete="off" spellCheck={false} {...form.register('setup_token')} />
        </Field>
        <Field
          label={t('setup.instanceName')}
          help={t('setup.instanceNameHelp')}
          error={fieldMessage(t, err.instance_name?.message)}
        >
          <Input {...form.register('instance_name')} />
        </Field>
        <Field label={t('setup.username')} error={fieldMessage(t, err.username?.message)}>
          <Input autoComplete="username" autoCapitalize="none" {...form.register('username')} />
        </Field>
        <Field label={t('setup.displayName')} error={fieldMessage(t, err.display_name?.message)}>
          <Input autoComplete="nickname" {...form.register('display_name')} />
        </Field>
        <p className="text-sm text-muted-foreground">{t('setup.passkeyHelp')}</p>
        <Button type="submit" disabled={mutation.isPending}>
          {t('setup.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
