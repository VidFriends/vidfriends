// Settings: push (FR-NOTIF-03), data export (FR-ACCT-05), server, sign out; switching servers requires signing out (WF-PAIR-2).
import { useApiQuery } from '@vidfriends/api-client/react';
import { getMe, logout } from '@vidfriends/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';
import { ExportCard } from '@/features/export/export-card';
import { disablePush, enablePush, pushStatus, type PushStatus } from '@/features/push';
import { errorText, LANGUAGES, setLanguage, storedLanguage, type Language } from '@/i18n';
import { useSession } from '@/lib/session';
import { Body, Button, Card, ErrorBox, Screen } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Settings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const me = useApiQuery(getMe);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [privatePreviews, setPrivatePreviews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Language | null>(null);
  useEffect(() => {
    void pushStatus().then(setPush);
    void storedLanguage().then(setLanguageState);
  }, []);
  const chooseLanguage = (lng: Language | null) => {
    setLanguageState(lng);
    void setLanguage(lng);
  };

  async function togglePush(on: boolean) {
    setError(null);
    try {
      if (on) setPush(await enablePush(session.api, privatePreviews));
      else {
        await disablePush(session.api);
        setPush('off');
      }
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function signOut(forgetServer: boolean) {
    await disablePush(session.api);
    await session.api.call(logout, { body: { all: false } }).catch(() => {});
    await session.signOut({ forgetServer });
    router.replace('/');
  }

  const user = me.data?.user;
  return (
    <Screen edges={['bottom']}>
      <ErrorBox message={error} />
      <Card>
        <Body>
          {t('settings.signedInAs', { name: user ? user.display_name || user.username : '' })}
        </Body>
        <Body muted>
          {t('settings.server', {
            name: session.instance?.name ?? '',
            url: session.instance?.baseUrl ?? '',
          })}
        </Body>
      </Card>
      <Card>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{t('settings.push')}</Text>
          <Switch
            accessibilityLabel={t('settings.push')}
            value={push === 'enabled'}
            disabled={push === 'unavailable' || push === null}
            onValueChange={(v) => void togglePush(v)}
          />
        </View>
        {push === 'unavailable' ? <Body muted>{t('settings.pushUnavailable')}</Body> : null}
        {push === 'denied' ? <Body muted>{t('settings.pushDenied')}</Body> : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>
            {t('settings.privatePreviews')}
          </Text>
          <Switch
            accessibilityLabel={t('settings.privatePreviews')}
            value={privatePreviews}
            disabled={push === 'enabled'}
            onValueChange={setPrivatePreviews}
          />
        </View>
        <Body muted>{t('settings.privatePreviewsHelp')}</Body>
      </Card>
      <Card>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16 }}>
          {t('language.title')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        >
          <Button
            label={t('language.system')}
            variant={language === null ? 'primary' : 'secondary'}
            onPress={() => chooseLanguage(null)}
          />
          {LANGUAGES.map((l) => (
            <Button
              key={l}
              label={LANGUAGE_NAMES[l]}
              variant={language === l ? 'primary' : 'secondary'}
              onPress={() => chooseLanguage(l)}
            />
          ))}
        </View>
      </Card>
      <ExportCard />
      <Button
        label={t('settings.signOut')}
        variant="secondary"
        onPress={() => void signOut(false)}
        testID="settings-signout"
      />
      <Button
        label={t('settings.switchServer')}
        variant="danger"
        onPress={() => void signOut(true)}
      />
      <Body muted>{t('settings.webOnly')}</Body>
    </Screen>
  );
}

/** Each language in its own name, so it can be found whatever the current language is. */
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Español' };
