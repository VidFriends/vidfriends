// Downloads (FR-MOB-04): offline copies, playable without a connection, with the storage cap.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '@/features/offline/download-button';
import { CAP_CHOICES } from '@/features/offline/plan';
import { useOffline } from '@/features/offline/store';
import { relativeTime } from '@/i18n';
import { Body, Button, Card, Screen } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Downloads() {
  const { t } = useTranslation();
  const theme = useTheme();
  const offline = useOffline();
  const { entries, cap_bytes } = offline.index;
  return (
    <Screen edges={['bottom']}>
      <Body muted>
        {t('offline.usage', { used: formatBytes(offline.used), cap: formatBytes(cap_bytes) })}
      </Body>
      <Body muted>{t('offline.help')}</Body>
      {entries.length === 0 ? <Body>{t('offline.empty')}</Body> : null}
      {entries.map((e) => (
        <Card key={e.share_id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('offline.play', { title: e.title })}
            onPress={() => router.push({ pathname: '/offline/[id]', params: { id: e.share_id } })}
            testID={`offline-item-${e.share_id}`}
          >
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {e.title}
            </Text>
            <Body muted>
              {e.person} · {formatBytes(e.bytes)} · {relativeTime(e.downloaded_at)}
            </Body>
          </Pressable>
          <Button
            label={t('offline.remove')}
            variant="secondary"
            onPress={() => offline.remove(e.share_id)}
          />
        </Card>
      ))}
      <Text accessibilityRole="header" style={[styles.h2, { color: theme.text }]}>
        {t('offline.capTitle')}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {CAP_CHOICES.map((c) => (
          <Button
            key={c}
            label={formatBytes(c)}
            variant={c === cap_bytes ? 'primary' : 'secondary'}
            onPress={() => offline.setCap(c)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600' },
  h2: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
