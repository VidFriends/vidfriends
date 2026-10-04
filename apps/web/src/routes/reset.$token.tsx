import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import { Password, usePasswordReset } from '@vidfriends/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { PasswordInput } from '@/components/password-input';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { applyApiError, fieldMessage } from '@/lib/errors';

// WF-ADM-4: an admin-issued, single-use link; using it revokes every session of that user.
const schema = z
  .object({ new_password: Password, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'password_mismatch' });
type Values = z.infer<typeof schema>;

export const Route = createFileRoute('/reset/$token')({
  component: ResetPage,
});

function ResetPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const queryClient = Route.useRouteContext().queryClient;
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const mutation = useApiMutation(usePasswordReset, {
    onSuccess: () => {
      // Every session of the user was revoked, possibly including this browser's.
      queryClient.clear();
      setDone(true);
    },
    onError: (err) => setFormError(applyApiError(t, err, form.setError, ['new_password'])),
  });
  const err = form.formState.errors;
  return (
    <AuthShell title={t('reset.title')} subtitle={t('reset.subtitle')}>
      {done ? (
        <div className="grid gap-4">
          <Alert>{t('reset.done')}</Alert>
          <Link to="/login" className={buttonVariants()}>
            {t('reset.toLogin')}
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((v) => {
            setFormError(null);
            mutation.mutate({ params: { token }, body: { new_password: v.new_password } });
          })}
        >
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <Field
            label={t('settings.newPassword')}
            error={fieldMessage(t, err.new_password?.message)}
          >
            <PasswordInput autoComplete="new-password" {...form.register('new_password')} />
          </Field>
          <Field
            label={t('settings.confirmPassword')}
            error={fieldMessage(t, err.confirm?.message)}
          >
            <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <Button type="submit" disabled={mutation.isPending}>
            {t('reset.submit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
