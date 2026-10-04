// Download / remove an offline copy of a share (FR-MOB-04).
import type { ShareDetail } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorBox } from '@/ui/kit';
import { useOffline } from './store';

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function DownloadButton({ share }: { share: ShareDetail }) {
  const { t } = useTranslation();
  const offline = useOffline();
  const [error, setError] = useState<string | null>(null);
  const bytes = share.video.media_bytes;
  if (share.video.state !== 'ready' || !bytes) return null;
  const other = share.role === 'recipient' ? share.sender : share.recipient;
  const saved = offline.index.entries.some((e) => e.share_id === share.id);
  const pct = offline.progress[share.id];

  if (pct !== undefined) {
    return (
      <>
        <Body muted>{t('offline.downloading', { pct: Math.round(pct * 100) })}</Body>
        <Button
          label={t('offline.cancel')}
          variant="secondary"
          onPress={() => offline.cancel(share.id)}
        />
      </>
    );
  }
  if (saved) {
    return (
      <Button
        label={t('offline.remove')}
        variant="secondary"
        onPress={() => offline.remove(share.id)}
        testID="offline-remove"
      />
    );
  }
  return (
    <>
      <ErrorBox message={error} />
      <Button
        label={t('offline.download', { size: formatBytes(bytes) })}
        variant="secondary"
        testID="offline-download"
        onPress={() => {
          setError(null);
          void offline
            .download({
              shareId: share.id,
              title: share.video.title || t('feed.untitled'),
              person: other.display_name || other.username,
              bytes,
            })
            .catch((err: Error) => {
              if (err.message === 'cancelled') return;
              setError(
                t(`offline.errors.${err.message}`, { defaultValue: t('offline.errors.failed') }),
              );
            });
        }}
      />
    </>
  );
}
