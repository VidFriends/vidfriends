import Ionicons from '@expo/vector-icons/Ionicons';
import { unreadCount } from '@vidfriends/contracts';
import { useApiQuery } from '@vidfriends/api-client/react';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useTheme } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} accessibilityElementsHidden />
  );

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const { hasShareIntent } = useShareIntentContext();
  // FR-NOTIF-05: unread badge refreshes at least every 60 s.
  const unread = useApiQuery(
    unreadCount,
    {},
    { refetchInterval: 60_000, enabled: session.signedIn },
  ).data?.count;

  // FR-MOB-02: a link or video shared from another app opens Send.
  useEffect(() => {
    if (hasShareIntent && session.signedIn) router.navigate('/(tabs)/send');
  }, [hasShareIntent, session.signedIn]);

  if (session.ready && !session.signedIn) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{ title: t('nav.home'), headerShown: false, tabBarIcon: icon('play-circle') }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: t('nav.inbox'), tabBarIcon: icon('file-tray') }}
      />
      <Tabs.Screen
        name="send"
        options={{ title: t('nav.send'), tabBarIcon: icon('paper-plane') }}
      />
      <Tabs.Screen
        name="friends"
        options={{ title: t('nav.friends'), tabBarIcon: icon('people') }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('nav.more'),
          tabBarIcon: icon('ellipsis-horizontal-circle'),
          tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarAccessibilityLabel: unread ? t('nav.moreUnread', { count: unread }) : t('nav.more'),
        }}
      />
    </Tabs>
  );
}
