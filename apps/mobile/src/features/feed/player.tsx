// Vertical feed player (FRD §7, TDD §4): one item per screen, at most 3 mounted players (active
// and its neighbours), muted autoplay with the unmute choice remembered for the session, no
// autoplay when the system asks for reduced motion, and progress beacons.
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@vidfriends/api-client/react';
import { getFeed, getShareMedia, reportProgress, type FeedItem } from '@vidfriends/contracts';
import { useEventListener } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { createProgressThrottle } from './progress';

export interface PlayerPrefs {
  muted: boolean;
  setMuted(muted: boolean): void;
  reduceMotion: boolean;
}

export function FeedSlide({
  item,
  height,
  active,
  near,
  prefs,
}: {
  item: FeedItem;
  height: number;
  active: boolean;
  near: boolean;
  prefs: PlayerPrefs;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const playable = item.video.state === 'ready';
  const media = useQuery({
    queryKey: [getShareMedia.id, item.id],
    queryFn: () => api.call(getShareMedia, { params: { id: item.id } }),
    enabled: near && (playable || item.video.has_thumbnail),
    staleTime: 10 * 60_000, // URLs live ≤ 15 min (ADR-0009)
  });
  const sender = item.sender.display_name || item.sender.username;
  return (
    <View style={[styles.slide, { height }]} testID={`feed-item-${item.id}`}>
      {playable && near && media.data?.media_url ? (
        <ActivePlayer
          shareId={item.id}
          uri={media.data.media_url}
          active={active}
          prefs={prefs}
          label={t('feed.videoFrom', {
            title: item.video.title || t('feed.untitled'),
            name: sender,
          })}
        />
      ) : (
        <LinkCard item={item} thumb={media.data?.thumb_url ?? null} />
      )}
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.sender} accessibilityRole="header">
          {t('feed.from', { name: sender })}
          {item.also_sent_by.length
            ? ` ${t('feed.alsoFrom', { count: item.also_sent_by.length })}`
            : ''}
        </Text>
        {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>
          {item.video.title}
        </Text>
        <View style={styles.actions}>
          {playable ? (
            <OverlayButton
              label={prefs.muted ? t('feed.unmute') : t('feed.mute')}
              onPress={() => prefs.setMuted(!prefs.muted)}
            />
          ) : null}
          <OverlayButton
            label={
              item.reply_count
                ? t('feed.conversationCount', { count: item.reply_count })
                : t('feed.reactReply')
            }
            onPress={() => router.push({ pathname: '/share/[id]', params: { id: item.id } })}
          />
        </View>
      </View>
    </View>
  );
}

function ActivePlayer({
  shareId,
  uri,
  active,
  prefs,
  label,
}: {
  shareId: string;
  uri: string;
  active: boolean;
  prefs: PlayerPrefs;
  label: string;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = prefs.muted;
    p.timeUpdateEventInterval = 1;
  });
  const throttle = useRef(createProgressThrottle());

  const send = (force: boolean) => {
    const sample = throttle.current(player.currentTime, player.duration, Date.now(), force);
    if (!sample) return;
    void api
      .call(reportProgress, { params: { id: shareId }, body: sample })
      .then((r) => {
        if (r.watched_at) void qc.invalidateQueries({ queryKey: [getFeed.id] });
      })
      .catch(() => {});
  };

  useEventListener(player, 'timeUpdate', () => {
    if (active) send(false);
  });

  useEffect(() => {
    player.muted = prefs.muted;
  }, [player, prefs.muted]);

  useEffect(() => {
    if (active && !prefs.reduceMotion) player.play();
    if (!active) {
      if (player.playing) send(true);
      player.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, player, prefs.reduceMotion]);

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Double tap to play or pause"
      onPress={() => {
        if (player.playing) {
          player.pause();
          send(true);
        } else player.play();
      }}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </Pressable>
  );
}

/** Link-only, expired, failed or still-processing videos (BR-MED-3/5): open the original. */
function LinkCard({ item, thumb }: { item: FeedItem; thumb: string | null }) {
  const { t } = useTranslation();
  const api = useApi();
  const qc = useQueryClient();
  const state = item.video.state;
  const message =
    state === 'expired'
      ? t('feed.expired')
      : state === 'link_only' || state === 'failed'
        ? t('feed.linkOnly')
        : t('feed.processing');
  return (
    <View style={styles.card}>
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={styles.thumb}
          resizeMode="contain"
          accessible={false}
        />
      ) : null}
      <Text style={styles.cardText}>{message}</Text>
      {item.video.source_url ? (
        <OverlayButton
          label={t('feed.openOriginal')}
          onPress={() => {
            void Linking.openURL(item.video.source_url!);
            void api
              .call(reportProgress, {
                params: { id: item.id },
                body: { position_ms: 0, opened_original: true },
              })
              .then(() => qc.invalidateQueries({ queryKey: [getFeed.id] }))
              .catch(() => {});
          }}
        />
      ) : null}
    </View>
  );
}

function OverlayButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slide: { width: '100%', backgroundColor: '#000', justifyContent: 'flex-end' },
  overlay: { padding: 16, paddingBottom: 24, gap: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  sender: { color: '#fff', fontWeight: '700', fontSize: 16 },
  note: { color: '#fff', fontSize: 16 },
  title: { color: '#e4e4e7', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  button: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  thumb: { width: '100%', height: '55%' },
  cardText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});
