// In-app notifications (FR-NOTIF-01): opening the list marks everything read.
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useApiInfiniteQuery, useApiMutation } from '@vidfriends/api-client/react';
import { listNotifications, markRead, unreadCount, type Notification } from '@vidfriends/contracts';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorText, relativeTime } from '@/i18n';
import { Body, ErrorBox, Loading } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

export default function Notifications() {
  const { t } = useTranslation();
  const theme = useTheme();
  const qc = useQueryClient();
  const query = useApiInfiniteQuery(listNotifications, { query: { limit: 30 } });
  const read = useApiMutation(markRead, {
    onSuccess: () => qc.invalidateQueries({ queryKey: [unreadCount.id] }),
  });
  const items = (query.data?.pages ?? []).flatMap((p) => p.items as Notification[]);
  const hasUnread = items.some((n) => !n.read_at);
  useEffect(() => {
    if (hasUnread) read.mutate({ body: { all: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);
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
      keyExtractor={(n) => n.id}
      style={{ backgroundColor: theme.bg }}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      onEndReached={() => query.hasNextPage && void query.fetchNextPage()}
      ListEmptyComponent={
        <View style={{ padding: 16 }}>
          <Body muted>{t('notifications.empty')}</Body>
        </View>
      }
      renderItem={({ item }) => {
        const name = item.actor
          ? item.actor.display_name || item.actor.username
          : t('notifications.someone');
        const text = t(`notifications.types.${item.type}`, { name, emoji: item.data.emoji ?? '' });
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${text}, ${relativeTime(item.created_at)}`}
            onPress={() =>
              item.share_id
                ? router.push({ pathname: '/share/[id]', params: { id: item.share_id } })
                : router.push('/(tabs)/friends')
            }
            style={({ pressed }) => [
              styles.row,
              { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: theme.text, fontWeight: item.read_at ? '400' : '700' }}>
              {text}
            </Text>
            <Text style={{ color: theme.muted }}>{relativeTime(item.created_at)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { padding: space.lg, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
});
