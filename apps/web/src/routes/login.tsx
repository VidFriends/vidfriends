import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { signIn, signInOptions } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { assertPasskey, passkeyErrorMessage } from '@/lib/passkeys';
import { instanceQuery } from '@/lib/session';

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

/** Only same-app relative paths are allowed as post-sign-in targets (no open redirect). */
export function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/';
  return target;
}

/** Sign-in with a passkey (WF-AUTH-3, ADR-0018): no username or password to type. */
export async function signInWithPasskey() {
  return assertPasskey(
    () => api.call(signInOptions, { body: {} }),
    (ceremony_id, credential) => api.call(signIn, { body: { ceremony_id, credential } }),
  );
}

function LoginPage() {
  const { t } = useTranslation();
  const instance = Route.useLoaderData();
  const { redirect: target, expired } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPasskey();
      queryClient.clear();
      await navigate({ to: safeRedirect(target) });
    } catch (err) {
      setError(passkeyErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t('login.title')} subtitle={t('login.subtitle', { name: instance.name })}>
      <div className="grid gap-4">
        {expired && !error && <Alert>{t('login.expired')}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="text-sm text-muted-foreground">{t('login.passkeyHelp')}</p>
        <Button onClick={() => void go()} disabled={busy}>
          {t('login.submit')}
        </Button>
        <p className="text-sm text-muted-foreground">{t('login.noAccount')}</p>
        <p className="text-sm text-muted-foreground">{t('login.lostPasskey')}</p>
      </div>
    </AuthShell>
  );
}
