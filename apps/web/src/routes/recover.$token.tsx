import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useApiQuery } from '@vidfriends/api-client/react';
import { getRecovery, recover, recoveryOptions } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { createPasskey, passkeyErrorMessage } from '@/lib/passkeys';

export const Route = createFileRoute('/recover/$token')({
  component: RecoverPage,
});

/**
 * WF-ADM-4: an admin-issued, single-use link. The new passkey replaces every other passkey of
 * the account and every session is signed out (ADR-0018).
 */
function RecoverPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const info = useApiQuery(getRecovery, { params: { token } }, { retry: false });
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      createPasskey(
        () => api.call(recoveryOptions, { params: { token }, body: {} }),
        (ceremony_id, credential) =>
          api.call(recover, { params: { token }, body: { ceremony_id, credential } }),
      ),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: '/' });
    },
    onError: (err) => setError(passkeyErrorMessage(t, err)),
  });

  return (
    <AuthShell
      title={t('recover.title')}
      subtitle={
        info.data
          ? t('recover.for', { name: info.data.display_name || info.data.username })
          : undefined
      }
    >
      {info.isError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">{errorMessage(t, info.error)}</Alert>
          <Link to="/login" className="text-sm underline">
            {t('recover.goLogin')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <p className="text-sm">{t('recover.intro')}</p>
          <p className="text-sm text-muted-foreground">{t('recover.effect')}</p>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !info.data}>
            {t('recover.submit')}
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
