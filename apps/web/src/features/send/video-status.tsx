// Shows a video's pipeline state while it processes, then a preview (FRD §5).
import { useApiQuery } from '@vidfriends/api-client/react';
import { getVideo, getVideoMedia, type Video } from '@vidfriends/contracts';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';

const PENDING = new Set(['queued', 'fetching', 'processing']);

export function useVideoProgress(initial: Video) {
  const query = useApiQuery(
    getVideo,
    { params: { id: initial.id } },
    {
      initialData: { video: initial },
      refetchInterval: (q) => (PENDING.has(q.state.data?.video.state ?? '') ? 2000 : false),
    },
  );
  return query.data?.video ?? initial;
}

export function VideoStatus({ video }: { video: Video }) {
  const { t } = useTranslation();
  const pending = PENDING.has(video.state);
  const playable =
    video.state === 'ready' || video.state === 'link_only' || video.state === 'expired';
  const media = useApiQuery(
    getVideoMedia,
    { params: { id: video.id } },
    { enabled: playable, staleTime: 10 * 60_000 },
  );
  return (
    <div className="grid gap-3">
      <div
        aria-live="polite"
        className="flex items-center gap-2 text-sm"
        data-testid="video-state"
        data-state={video.state}
      >
        {pending && (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        )}
        <span>{t(`send.status.${video.state}`)}</span>
        {video.failure_reason && video.state !== 'ready' && (
          <span className="text-muted-foreground">
            {t(`send.reasons.${video.failure_reason}`, { defaultValue: '' })}
          </span>
        )}
      </div>
      {video.title && <p className="font-medium">{video.title}</p>}
      {video.state === 'ready' && media.data?.media_url && (
        // Sources provide no captions in v1 (TDD §4); the control has an accessible name.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={media.data.media_url}
          poster={media.data.thumb_url ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={t('send.preview')}
          className="max-h-[60vh] w-full rounded-md bg-black object-contain"
          data-testid="preview-player"
        />
      )}
      {video.state !== 'ready' && playable && (
        <div className="grid gap-2 rounded-md border p-3">
          {media.data?.thumb_url && (
            <img src={media.data.thumb_url} alt="" className="max-h-48 rounded object-cover" />
          )}
          {video.source_url && (
            <a
              href={video.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              <ExternalLink aria-hidden />
              {t('send.openOriginal')}
            </a>
          )}
        </div>
      )}
      {video.state === 'failed' && <Alert variant="destructive">{t('send.status.failed')}</Alert>}
    </div>
  );
}
