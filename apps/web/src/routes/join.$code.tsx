import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import { DisplayName, Password, previewInvite, register, Username } from '@vidfriends/contracts';
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
import { formatRelative } from '@/i18n';
import { applyApiError, errorMessage, fieldMessage } from '@/lib/errors';
import { instanceQuery } from '@/lib/session';

const schema = z.object({
  display_name: DisplayName,
  username: Username,
  password: Password,
});
type Values = z.infer<typeof schema>;

export const Route = createFileRoute('/join/$code')({
  loader: ({ context }) => context.queryClient.ensureQueryData(instanceQuery()),
  component: JoinPage,
});

function JoinPage() {
  const { t } = useTranslation();
  const { code } = Route.useParams();
  const instance = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const preview = useApiQuery(previewInvite, { params: { code } }, { retry: false });
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '' },
  });
  const mutation = useApiMutation(register, {
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: '/' });
    },
    onError: (err) =>
      setFormError(applyApiError(t, err, form.setError, ['display_name', 'username', 'password'])),
  });
  const err = form.formState.errors;

  return (
    <AuthShell
      title={t('join.title', { name: instance.name })}
      subtitle={
        preview.data ? (
          <>
            <span>{t('join.invitedBy', { name: preview.data.inviter_display_name })}</span>{' '}
            <span>{t('join.expires', { when: formatRelative(preview.data.expires_at) })}</span>
          </>
        ) : undefined
      }
    >
      {preview.isError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">{errorMessage(t, preview.error)}</Alert>
          <Link to="/login" className="text-sm underline">
            {t('join.haveAccount')}
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((v) => {
            setFormError(null);
            mutation.mutate({ body: { ...v, invite_code: code, client: 'web' } });
          })}
        >
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <Field
            label={t('join.displayName')}
            help={t('join.displayNameHelp')}
            error={fieldMessage(t, err.display_name?.message)}
          >
            <Input autoComplete="nickname" {...form.register('display_name')} />
          </Field>
          <Field
            label={t('join.username')}
            help={t('join.usernameHelp')}
            error={fieldMessage(t, err.username?.message)}
          >
            <Input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              {...form.register('username')}
            />
          </Field>
          <Field
            label={t('join.password')}
            help={t('join.passwordHelp')}
            error={fieldMessage(t, err.password?.message)}
          >
            <PasswordInput autoComplete="new-password" {...form.register('password')} />
          </Field>
          <p className="text-xs text-muted-foreground">{t('join.trust')}</p>
          <Button type="submit" disabled={mutation.isPending || preview.isPending}>
            {t('join.submit')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('join.appHint')}</p>
          <Link to="/login" className="text-sm underline">
            {t('join.haveAccount')}
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
