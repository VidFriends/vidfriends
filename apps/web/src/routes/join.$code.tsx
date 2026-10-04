import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@vidfriends/api-client';
import { useApiQuery } from '@vidfriends/api-client/react';
import {
  DisplayName,
  previewInvite,
  register,
  registerOptions,
  Username,
} from '@vidfriends/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatRelative } from '@/i18n';
import { api } from '@/lib/api';
import { applyApiError, errorMessage, fieldMessage } from '@/lib/errors';
import { createPasskey, passkeyErrorMessage } from '@/lib/passkeys';
import { instanceQuery } from '@/lib/session';

const schema = z.object({
  display_name: DisplayName,
  username: Username,
});
type Values = z.infer<typeof schema>;

export const Route = createFileRoute('/join/$code')({
  loader: ({ context }) => context.queryClient.ensureQueryData(instanceQuery()),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const instance = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <JoinScreen code={code} instanceName={instance.name} onJoined={() => navigate({ to: '/' })} />
  );
}

/** WF-AUTH-2 on the web, also used by the app's browser hand-off (`/app-auth`). */
export function JoinScreen({
  code,
  instanceName,
  onJoined,
  showAppHint = true,
}: {
  code: string;
  instanceName: string;
  onJoined: () => Promise<unknown> | void;
  showAppHint?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const preview = useApiQuery(previewInvite, { params: { code } }, { retry: false });
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '' },
  });
  // Check invite and username, then create the member's passkey (ADR-0018).
  const mutation = useMutation({
    mutationFn: (v: Values) =>
      createPasskey(
        () => api.call(registerOptions, { body: { ...v, invite_code: code } }),
        (ceremony_id, credential) => api.call(register, { body: { ceremony_id, credential } }),
      ),
    onSuccess: async () => {
      queryClient.clear();
      await onJoined();
    },
    onError: (err) =>
      setFormError(
        err instanceof ApiError
          ? applyApiError(t, err, form.setError, ['display_name', 'username'])
          : passkeyErrorMessage(t, err),
      ),
  });
  const err = form.formState.errors;

  return (
    <AuthShell
      title={t('join.title', { name: instanceName })}
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
            mutation.mutate(v);
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
          <p className="text-sm text-muted-foreground">{t('join.passkeyHelp')}</p>
          <p className="text-xs text-muted-foreground">{t('join.trust')}</p>
          <Button type="submit" disabled={mutation.isPending || preview.isPending}>
            {t('join.submit')}
          </Button>
          {showAppHint && <p className="text-xs text-muted-foreground">{t('join.appHint')}</p>}
          <Link to="/login" className="text-sm underline">
            {t('join.haveAccount')}
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
