// A share and its private conversation (FR-ENG-01/02, BR-SHR-4): reactions for the recipient,
// replies for both sides, save/hide for the recipient, unsend for the sender while unwatched.
import { useQueryClient } from '@tanstack/react-query';
import { useApiInfiniteQuery, useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import {
  clearReaction,
  deleteReply,
  getFeed,
  getShare,
  getShareMedia,
  listReplies,
  postReply,
  REACTIONS,
  setReaction,
  unsendShare,
  updateShare,
  type Reply,
} from '@vidfriends/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { DownloadButton } from '@/features/offline/download-button';
import { useOffline } from '@/features/offline/store';
import { errorText, relativeTime } from '@/i18n';
import { Body, Button, Card, ErrorBox, Field, Loading, Screen } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function ShareScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const share = useApiQuery(getShare, { params: { id } });
  // FR-MOB-04: an offline copy plays without fetching a media URL.
  const localUri = useOffline().localUri(id);
  const media = useApiQuery(
    getShareMedia,
    { params: { id } },
    {
      enabled: !localUri && share.data?.share.video.state === 'ready',
      staleTime: 10 * 60_000,
    },
  );
  const replies = useApiInfiniteQuery(listReplies, { params: { id }, query: { limit: 50 } });
  const [draft, setDraft] = useState('');
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [getShare.id] }),
      qc.invalidateQueries({ queryKey: [listReplies.id] }),
      qc.invalidateQueries({ queryKey: [getFeed.id] }),
    ]);
  const onError = (err: unknown) => setError(errorText(err));
  const [error, setError] = useState<string | null>(null);
  const react = useApiMutation(setReaction, { onSuccess: refresh, onError });
  const unreact = useApiMutation(clearReaction, { onSuccess: refresh, onError });
  const reply = useApiMutation(postReply, {
    onSuccess: () => {
      setDraft('');
      void refresh();
    },
    onError,
  });
  const removeReply = useApiMutation(deleteReply, { onSuccess: refresh, onError });
  const update = useApiMutation(updateShare, { onSuccess: refresh, onError });
  const unsend = useApiMutation(unsendShare, {
    onSuccess: () => {
      void refresh();
      router.back();
    },
    onError,
  });

  if (share.isPending) return <Loading />;
  if (share.isError)
    return (
      <Screen>
        <ErrorBox message={errorText(share.error)} />
      </Screen>
    );
  const s = share.data.share;
  const other = s.role === 'recipient' ? s.sender : s.recipient;
  const otherName = other.display_name || other.username;
  const items = (replies.data?.pages ?? []).flatMap((p) => p.items as Reply[]);

  return (
    <Screen edges={['bottom']}>
      {localUri || media.data?.media_url ? (
        <SharePlayer uri={(localUri ?? media.data?.media_url)!} />
      ) : (
        <Card>
          <Body>{t(`share.state.${s.video.state}`, { defaultValue: s.video.state })}</Body>
        </Card>
      )}
      <Text accessibilityRole="header" style={[styles.h, { color: theme.text }]}>
        {s.video.title || t('feed.untitled')}
      </Text>
      <Body muted>
        {s.role === 'recipient'
          ? t('share.fromName', { name: otherName })
          : t('share.toName', { name: otherName })}
        {s.watched_at ? ` · ${t('share.watched', { when: relativeTime(s.watched_at) })}` : ''}
      </Body>
      {s.note ? <Body>{s.note}</Body> : null}
      <DownloadButton share={s} />
      {s.video.source_url ? (
        <Button
          label={t('feed.openOriginal')}
          variant="secondary"
          onPress={() => void Linking.openURL(s.video.source_url!)}
        />
      ) : null}
      <ErrorBox message={error} />

      {s.role === 'recipient' ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('share.reactions')}
          style={styles.row}
        >
          {REACTIONS.map((emoji) => {
            const selected = s.reaction === emoji;
            return (
              <Pressable
                key={emoji}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={t(`reactions.${emoji}`, { defaultValue: emoji })}
                onPress={() =>
                  selected
                    ? unreact.mutate({ params: { id } })
                    : react.mutate({ params: { id }, body: { emoji } })
                }
                style={[styles.emoji, { borderColor: selected ? theme.primary : theme.border }]}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : s.reaction ? (
        <Body>{t('share.theyReacted', { name: otherName, emoji: s.reaction })}</Body>
      ) : null}

      {s.role === 'recipient' ? (
        <View style={styles.row}>
          <Button
            label={s.saved ? t('share.unsave') : t('share.save')}
            variant="secondary"
            onPress={() => update.mutate({ params: { id }, body: { saved: !s.saved } })}
          />
          <Button
            label={s.hidden ? t('share.unhide') : t('share.hide')}
            variant="secondary"
            onPress={() => update.mutate({ params: { id }, body: { hidden: !s.hidden } })}
          />
        </View>
      ) : !s.watched_at ? (
        <Button
          label={t('share.unsend')}
          variant="danger"
          onPress={() => unsend.mutate({ params: { id } })}
        />
      ) : null}

      <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
        {t('share.conversation', { name: otherName })}
      </Text>
      {items.length === 0 ? <Body muted>{t('share.noReplies')}</Body> : null}
      {items.map((r) => {
        const mine = r.author.id !== other.id;
        return (
          <Card key={r.id}>
            <Body muted>
              {mine ? t('share.you') : r.author.display_name || r.author.username} ·{' '}
              {relativeTime(r.created_at)}
            </Body>
            <Body>{r.deleted ? t('share.replyDeleted') : r.body}</Body>
            {mine && !r.deleted ? (
              <Button
                label={t('share.deleteReply')}
                variant="secondary"
                onPress={() => removeReply.mutate({ params: { id: r.id } })}
              />
            ) : null}
          </Card>
        );
      })}
      <Field
        label={t('share.replyLabel', { name: otherName })}
        value={draft}
        onChangeText={setDraft}
        maxLength={1000}
        multiline
        testID="reply-input"
      />
      <Button
        label={t('share.send')}
        disabled={!draft.trim()}
        busy={reply.isPending}
        onPress={() => reply.mutate({ params: { id }, body: { body: draft.trim() } })}
        testID="reply-send"
      />
    </Screen>
  );
}

function SharePlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.player}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: {
    minWidth: 48,
    minHeight: 48,
    borderWidth: 2,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  player: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 480,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
});
