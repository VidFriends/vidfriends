// Received-share lists: Inbox, Saved and History (BR-FEED-2..4).
import { FlashList } from '@shopify/flash-list';
import { useApiInfiniteQuery } from '@vidfriends/api-client/react';
import { getHistory, getInbox, getSaved, type ReceivedShare } from '@vidfriends/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorText, relativeTime } from '@/i18n';
import { Avatar } from '@/ui/avatar';
import { Body, ErrorBox, Loading } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

const ROUTES = { inbox: getInbox, saved: getSaved, history: getHistory } as const;

export function ReceivedList({ kind }: { kind: keyof typeof ROUTES }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const query = useApiInfiniteQuery(ROUTES[kind], { query: { limit: 30 } });
  const items = (query.data?.pages ?? []).flatMap((p) => p.items as ReceivedShare[]);
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <View style={{ padding: 16 }}>
        <ErrorBox message={errorText(query.error)} />
      </View>
    );
  return (
    <FlashList
      data={items}
      keyExtractor={(s) => s.id}
      style={{ backgroundColor: theme.bg }}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      onEndReached={() => query.hasNextPage && void query.fetchNextPage()}
      ListEmptyComponent={
        <View style={{ padding: 16 }}>
          <Body muted>{t(`lists.empty.${kind}`)}</Body>
        </View>
      }
      renderItem={({ item }) => <ShareRow share={item} />}
    />
  );
}

export function ShareRow({ share }: { share: ReceivedShare }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const sender = share.sender.display_name || share.sender.username;
  const status = share.watched_at
    ? t('lists.watchedWhen', { when: relativeTime(share.watched_at) })
    : t('lists.new');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('lists.rowLabel', {
        title: share.video.title || t('feed.untitled'),
        name: sender,
        status,
      })}
      onPress={() => router.push({ pathname: '/share/[id]', params: { id: share.id } })}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Avatar user={share.sender} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
          {share.video.title || t('feed.untitled')}
        </Text>
        <Text style={{ color: theme.muted }} numberOfLines={1}>
          {t('feed.from', { name: sender })} · {status}
          {share.reply_count
            ? ` · ${t('feed.conversationCount', { count: share.reply_count })}`
            : ''}
        </Text>
        {share.note ? (
          <Text style={{ color: theme.text }} numberOfLines={2}>
            {share.note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
});
