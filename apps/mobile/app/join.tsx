// J-2 on mobile: register through the invite from a scanned or pasted join link (FR-PAIR-04).
import { useQuery } from '@tanstack/react-query';
import { DisplayName, Password, previewInvite, register, Username } from '@vidfriends/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/i18n';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorBox, Field, Loading, Screen, Title } from '@/ui/kit';

export default function Join() {
  const { t } = useTranslation();
  const session = useSession();
  const code = session.pendingInvite;
  const preview = useQuery({
    queryKey: ['previewInvite', code],
    queryFn: () => session.api.call(previewInvite, { params: { code: code! } }),
    enabled: Boolean(code),
    retry: false,
  });
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Navigation follows the committed session state: signIn() clears the invite, and the tabs
  // guard would bounce an imperative navigation that runs before signedIn is rendered.
  if (session.signedIn) return <Redirect href="/(tabs)/feed" />;
  if (!code) return <Redirect href="/login" />;
  if (preview.isPending) return <Loading />;

  async function submit() {
    setError(null);
    const errs: Record<string, string> = {};
    const u = Username.safeParse(username);
    if (!u.success) errs.username = t('errors.username');
    const d = DisplayName.safeParse(displayName || username);
    if (!d.success) errs.display_name = t('errors.displayName');
    const p = Password.safeParse(password);
    if (!p.success)
      errs.password = t(`errors.${p.error.issues[0]?.message ?? 'password'}`, {
        defaultValue: t('errors.password'),
      });
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await session.api.call(register, {
        body: {
          username,
          password,
          display_name: displayName || undefined,
          invite_code: code!,
          client: 'mobile',
        },
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
      <Title>{t('join.title', { name: session.instance?.name ?? '' })}</Title>
      {preview.isError ? (
        <ErrorBox message={errorText(preview.error)} />
      ) : (
        <Body muted>{t('join.invitedBy', { name: preview.data?.inviter_display_name ?? '' })}</Body>
      )}
      {session.instance?.insecure ? <ErrorBox message={t('pair.insecureWarning')} /> : null}
      <ErrorBox message={error} />
      <Field
        label={t('join.username')}
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        error={fieldErrors.username}
        testID="join-username"
      />
      <Field
        label={t('join.displayName')}
        value={displayName}
        onChangeText={setDisplayName}
        error={fieldErrors.display_name}
        testID="join-display-name"
      />
      <Field
        label={t('join.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={fieldErrors.password}
        testID="join-password"
      />
      <Button
        label={t('join.submit')}
        busy={busy}
        onPress={() => void submit()}
        testID="join-submit"
      />
      <Button
        label={t('join.haveAccount')}
        variant="secondary"
        onPress={() => router.replace('/login')}
      />
    </Screen>
  );
}
