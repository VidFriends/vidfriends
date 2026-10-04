import { login } from '@vidfriends/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/i18n';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorBox, Field, Screen, Title } from '@/ui/kit';

export default function Login() {
  const { t } = useTranslation();
  const session = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Leave once the signed-in state is rendered (see join.tsx).
  if (session.signedIn) return <Redirect href="/(tabs)/feed" />;

  async function submit() {
    setError(null);
    if (!username.trim() || !password) return setError(t('errors.required'));
    setBusy(true);
    try {
      const res = await session.api.call(login, {
        body: { username: username.trim(), password, client: 'mobile' },
      });
      if (!res.token) throw new Error('no token');
      await session.signIn(res.token);
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
      {session.instance?.insecure ? <ErrorBox message={t('pair.insecureWarning')} /> : null}
      <ErrorBox message={error} />
      <Field
        label={t('login.username')}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        testID="login-username"
      />
      <Field
        label={t('login.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
        testID="login-password"
      />
      <Button
        label={t('login.submit')}
        busy={busy}
        onPress={() => void submit()}
        testID="login-submit"
      />
      <Body muted>{t('login.noAccount')}</Body>
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
