// The `vidfriends://auth` callback of the browser hand-off (WF-AUTH-5) when it arrives as a deep
// link: exchange the code, then continue to the feed (or back to sign-in on failure).
import { Redirect, router, useGlobalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/i18n';
import { CALLBACK_URL } from '@/lib/handoff';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorBox, Loading, Screen, Title } from '@/ui/kit';

export default function AuthCallback() {
  const { t } = useTranslation();
  const session = useSession();
  const { code, state } = useGlobalSearchParams<{ code?: string; state?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !state || !session.ready) return;
    const q = new URLSearchParams({ code, state });
    session.completeHandoff(`${CALLBACK_URL}?${q.toString()}`).catch((err: unknown) => {
      setError(
        err instanceof Error && err.message === 'handoff_invalid'
          ? t('login.handoffInvalid')
          : errorText(err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state, session.ready]);

  if (session.signedIn) return <Redirect href="/(tabs)/feed" />;
  if (!code || !state) return <Redirect href="/" />;
  if (!error) return <Loading />;
  return (
    <Screen>
      <Title>{t('login.title')}</Title>
      <ErrorBox message={error} />
      <Body muted>{t('login.tryAgain')}</Body>
      <Button label={t('login.title')} onPress={() => router.replace('/login')} />
    </Screen>
  );
}
