import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import { PushRegistration } from '@/features/push';
import { OfflineProvider } from '@/features/offline/store';
import { LanguageSync } from '@/features/language-sync';
import { RealtimeUpdates } from '@/features/realtime';
import { SessionProvider } from '@/lib/session';
import { useTheme } from '@/ui/theme';

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <PushRegistration />
        <RealtimeUpdates />
        <LanguageSync />
        <OfflineProvider>
          <Screens />
        </OfflineProvider>
      </SessionProvider>
    </ShareIntentProvider>
  );
}

function Screens() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="pair" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ title: t('pair.scanTitle') }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="share/[id]" options={{ title: t('share.title') }} />
      <Stack.Screen name="saved" options={{ title: t('lists.saved') }} />
      <Stack.Screen name="collections/index" options={{ title: t('collections.title') }} />
      <Stack.Screen name="collections/[id]" options={{ title: t('collections.title') }} />
      <Stack.Screen name="collections/pick" options={{ title: t('collections.add') }} />
      <Stack.Screen name="history" options={{ title: t('lists.history') }} />
      <Stack.Screen name="sent" options={{ title: t('lists.sent') }} />
      <Stack.Screen name="notifications" options={{ title: t('notifications.title') }} />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      <Stack.Screen name="downloads" options={{ title: t('offline.title') }} />
      <Stack.Screen name="offline/[id]" options={{ title: t('offline.title') }} />
    </Stack>
  );
}
