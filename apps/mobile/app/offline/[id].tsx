// Plays an offline copy (FR-MOB-04); works without a connection.
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useOffline } from '@/features/offline/store';
import { Body, Screen, Title } from '@/ui/kit';

export default function OfflinePlayer() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const offline = useOffline();
  const entry = offline.index.entries.find((e) => e.share_id === id);
  const uri = offline.localUri(id);
  if (!entry || !uri) {
    return (
      <Screen>
        <Body>{t('offline.missing')}</Body>
      </Screen>
    );
  }
  return <LocalPlayer uri={uri} title={entry.title} person={entry.person} />;
}

function LocalPlayer({ uri, title, person }: { uri: string; title: string; person: string }) {
  const { t } = useTranslation();
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <Screen edges={['bottom']}>
      <View style={styles.player}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls
          contentFit="contain"
        />
      </View>
      <Title>{title}</Title>
      <Body muted>{t('share.fromName', { name: person })}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 8 },
});
