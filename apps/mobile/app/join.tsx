// J-2 on mobile: join through the invite from a scanned or pasted join link (FR-PAIR-04). The
// account and its passkey are created on the server's web page in the secure browser sheet
// (WF-AUTH-5, ADR-0018); the app is signed in when the page hands back.
import { useQuery } from '@tanstack/react-query';
import { previewInvite } from '@vidfriends/contracts';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '@/i18n';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorBox, Loading, Screen, Title } from '@/ui/kit';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Navigation follows the committed session state: signIn() clears the invite, and the tabs
  // guard would bounce an imperative navigation that runs before signedIn is rendered.
  if (session.signedIn) return <Redirect href="/(tabs)/feed" />;
  if (!code) return <Redirect href="/login" />;
  if (preview.isPending) return <Loading />;

  async function join() {
    setError(null);
    setBusy(true);
    try {
      await session.startHandoff('join', code);
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
        <>
          <Body muted>
            {t('join.invitedBy', { name: preview.data?.inviter_display_name ?? '' })}
          </Body>
          <ErrorBox message={error} />
          <Body>{t('join.passkeyHelp')}</Body>
          <Button
            label={t('join.submit')}
            busy={busy}
            onPress={() => void join()}
            testID="join-submit"
          />
        </>
      )}
      <Button
        label={t('join.haveAccount')}
        variant="secondary"
        onPress={() => router.replace('/login')}
      />
    </Screen>
  );
}
