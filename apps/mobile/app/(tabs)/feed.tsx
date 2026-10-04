// Home feed (FR-FEED-01/02, BR-FEED-1): unwatched oldest first, then recently watched.
import { FlashList } from '@shopify/flash-list';
import { useApiInfiniteQuery } from '@vidfriends/api-client/react';
import { getFeed, type FeedItem } from '@vidfriends/contracts';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedSlide, type PlayerPrefs } from '@/features/feed/player';
import { errorText } from '@/i18n';
import { Body, Button, ErrorBox, Loading, Title } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Feed() {
  const { t } = useTranslation();
  const theme = useTheme();
  const focused = useIsFocused();
  const query = useApiInfiniteQuery(getFeed, { query: { limit: 10 } });
  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items as FeedItem[]),
    [query.data],
  );
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true); // muted autoplay; unmute lasts for the session
  const [reduceMotion, setReduceMotion] = useState(false);
  const [foreground, setForeground] = useState(true);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const a = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const b = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const prefs: PlayerPrefs = { muted, setMuted, reduceMotion };

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 16, backgroundColor: theme.bg }}>
        <ErrorBox message={errorText(query.error)} />
        <Button label={t('common.retry')} onPress={() => void query.refetch()} />
      </SafeAreaView>
    );
  if (!items.length)
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: theme.bg }}>
        <Title>{t('feed.emptyTitle')}</Title>
        <Body muted>{t('feed.empty')}</Body>
      </SafeAreaView>
    );

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      {height > 0 ? (
        <FlashList
          data={items}
          keyExtractor={(i) => i.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.y / height))}
          onEndReached={() => query.hasNextPage && void query.fetchNextPage()}
          onEndReachedThreshold={2}
          renderItem={({ item, index }) => (
            <FeedSlide
              item={item}
              height={height}
              active={focused && foreground && index === active}
              near={Math.abs(index - active) <= 1}
              prefs={prefs}
            />
          )}
          ListFooterComponent={
            query.hasNextPage ? null : (
              <View style={{ height, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Body>{t('feed.caughtUp')}</Body>
              </View>
            )
          }
        />
      ) : null}
    </View>
  );
}
