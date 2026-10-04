import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createMobileCode, logout } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { passkeyErrorMessage } from '@/lib/passkeys';
import { currentUser, instanceQuery } from '@/lib/session';
import { JoinScreen } from './join.$code';
import { signInWithPasskey } from './login';

/** The only place codes are sent: the app's own callback (ADR-0018, no open redirect). */
const CALLBACK = 'vidfriends://auth';

const search = z.object({
  mode: z.enum(['signin', 'join']).catch('signin'),
  state: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,128}$/)
    .optional()
    .catch(undefined),
  code_challenge: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional()
    .catch(undefined),
  invite: z
    .string()
    .regex(/^[A-Za-z0-9_-]{10,200}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/app-auth')({
  validateSearch: search,
  loader: ({ context }) => context.queryClient.ensureQueryData(instanceQuery()),
  component: AppAuthPage,
});

/**
 * WF-AUTH-5: the mobile app opens this page in the system's secure browser sheet. The member signs
 * in or joins with a passkey here; the page then hands a single-use, PKCE-bound code back to the
 * app. A web session this page created only for the hand-off is signed out again.
 */
function AppAuthPage() {
  const { t } = useTranslation();
  const instance = Route.useLoaderData();
  const { mode, state, code_challenge: challenge, invite } = Route.useSearch();
  const queryClient = Route.useRouteContext().queryClient;
  const me = useQuery({ queryKey: ['app-auth-me'], queryFn: () => currentUser(queryClient) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!state || !challenge) {
    return (
      <AuthShell title={t('appAuth.title')}>
        <Alert variant="destructive">{t('appAuth.invalid')}</Alert>
      </AuthShell>
    );
  }

  async function handOff(createdHere: boolean) {
    const { code } = await api.call(createMobileCode, { body: { code_challenge: challenge! } });
    if (createdHere) await api.call(logout, { body: { all: false } }).catch(() => {});
    queryClient.clear();
    setDone(true);
    window.location.href = `${CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state!)}`;
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(passkeyErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title={t('appAuth.title')}>
        <p>{t('appAuth.done')}</p>
      </AuthShell>
    );
  }

  if (mode === 'join' && invite && !me.data) {
    return (
      <JoinScreen
        code={invite}
        instanceName={instance.name}
        showAppHint={false}
        onJoined={() => run(() => handOff(true))}
      />
    );
  }

  return (
    <AuthShell title={t('appAuth.title')} subtitle={t('appAuth.subtitle', { name: instance.name })}>
      <div className="grid gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {me.data ? (
          <>
            <Button disabled={busy} onClick={() => void run(() => handOff(false))}>
              {t('appAuth.continueAs', {
                name: me.data.user.display_name || me.data.user.username,
              })}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await signInWithPasskey();
                  await handOff(true);
                })
              }
            >
              {t('appAuth.otherAccount')}
            </Button>
          </>
        ) : (
          <Button
            disabled={busy || me.isPending}
            onClick={() =>
              void run(async () => {
                await signInWithPasskey();
                await handOff(true);
              })
            }
          >
            {t('login.submit')}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t('appAuth.note')}</p>
      </div>
    </AuthShell>
  );
}
