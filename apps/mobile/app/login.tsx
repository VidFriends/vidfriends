// WF-AUTH-5: sign in with a passkey on the server's web page in the secure browser sheet.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/i18n';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorBox, Screen, Title } from '@/ui/kit';

export default function Login() {
  const { t } = useTranslation();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Leave once the signed-in state is rendered (see join.tsx).
  if (session.signedIn) return <Redirect href="/(tabs)/feed" />;

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      await session.startHandoff('signin');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{t('login.title')}</Title>
      <Body muted>{t('login.server', { name: session.instance?.name ?? '' })}</Body>
      <ErrorBox message={error} />
      <Body>{t('login.passkeyHelp')}</Body>
      <Button
        label={t('login.submit')}
        busy={busy}
        onPress={() => void signIn()}
        testID="login-submit"
      />
      <Body muted>{t('login.noAccount')}</Body>
      <Body muted>{t('login.lostPasskey')}</Body>
      <Button
        label={t('login.otherServer')}
        variant="secondary"
        onPress={() => {
          void session.signOut({ forgetServer: true }).then(() => router.replace('/pair'));
        }}
      />
    </Screen>
  );
}
