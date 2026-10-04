// WF-PAIR-1: scan a QR code or paste a join/instance link; verify the server, then save it.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseInstanceInput, verifyInstance } from '@/lib/instance';
import { useSession } from '@/lib/session';
import { Body, Button, ErrorBox, Field, Screen, Title } from '@/ui/kit';

export default function Pair() {
  const { t } = useTranslation();
  const session = useSession();
  const params = useLocalSearchParams<{ link?: string }>();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect(value: string) {
    setError(null);
    const parsed = parseInstanceInput(value);
    if (typeof parsed === 'string') {
      setError(t(`pair.errors.${parsed}`));
      return;
    }
    setBusy(true);
    const result = await verifyInstance(parsed.baseUrl);
    setBusy(false);
    if (!result.ok) {
      setError(t(`pair.errors.${result.reason}`));
      return;
    }
    await session.pair({ baseUrl: parsed.baseUrl, name: result.info.name }, parsed.inviteCode);
    router.replace(parsed.inviteCode ? '/join' : '/login');
  }

  // A QR code scanned on the scan screen comes back as ?link=.
  useEffect(() => {
    if (params.link) {
      setInput(params.link);
      void connect(params.link);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.link]);

  return (
    <Screen>
      <Title>{t('pair.title')}</Title>
      <Body muted>{t('pair.intro')}</Body>
      <Button label={t('pair.scan')} onPress={() => router.push('/scan')} testID="pair-scan" />
      <Field
        label={t('pair.linkLabel')}
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        placeholder="https://"
        returnKeyType="go"
        onSubmitEditing={() => void connect(input)}
        testID="pair-input"
      />
      <ErrorBox message={error} />
      <Button
        label={t('pair.connect')}
        variant="secondary"
        busy={busy}
        onPress={() => void connect(input)}
        testID="pair-connect"
      />
      <Body muted>{t('pair.noDefault')}</Body>
    </Screen>
  );
}
