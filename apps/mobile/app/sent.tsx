// Sent (FR-SHR-05, BR-SHR-4): per-recipient status, reaction and replies.
import { FlashList } from '@shopify/flash-list';
import { useApiInfiniteQuery } from '@vidfriends/api-client/react';
import { getSent, type SentShare } from '@vidfriends/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorText } from '@/i18n';
import { Avatar } from '@/ui/avatar';
import { Body, ErrorBox, Loading } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

export default function Sent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const query = useApiInfiniteQuery(getSent, { query: { limit: 30 } });
  const items = (query.data?.pages ?? []).flatMap((p) => p.items as SentShare[]);
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
          <Body muted>{t('lists.empty.sent')}</Body>
        </View>
      }
      renderItem={({ item }) => {
        const name = item.recipient.display_name || item.recipient.username;
        const status = t(`lists.status.${item.status}`);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lists.sentRowLabel', {
              title: item.video.title || t('feed.untitled'),
              name,
              status,
            })}
            onPress={() => router.push({ pathname: '/share/[id]', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Avatar user={item.recipient} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                {item.video.title || t('feed.untitled')}
              </Text>
              <Text style={{ color: theme.muted }}>
                {t('share.toName', { name })} · {status}
                {item.reaction ? ` · ${item.reaction}` : ''}
                {item.reply_count
                  ? ` · ${t('feed.conversationCount', { count: item.reply_count })}`
                  : ''}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
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
