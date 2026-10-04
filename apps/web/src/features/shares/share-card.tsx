// A received share in the Inbox / Saved / History lists (BR-FEED-2..4).
import { Link } from '@tanstack/react-router';
import { useApiQuery } from '@vidfriends/api-client/react';
import { getShareMedia, type ReceivedShare } from '@vidfriends/contracts';
import { MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/avatar';
import { formatRelative } from '@/i18n';

export function Thumbnail({
  shareId,
  hasThumb,
  className,
}: {
  shareId: string;
  hasThumb: boolean;
  className?: string;
}) {
  const media = useApiQuery(
    getShareMedia,
    { params: { id: shareId } },
    { enabled: hasThumb, staleTime: 10 * 60_000, retry: false },
  );
  return media.data?.thumb_url ? (
    <img
      src={media.data.thumb_url}
      alt=""
      className={className ?? 'h-20 w-14 shrink-0 rounded object-cover'}
      loading="lazy"
    />
  ) : (
    <div className={className ?? 'h-20 w-14 shrink-0 rounded bg-muted'} aria-hidden />
  );
}

export function ShareCard({ share, actions }: { share: ReceivedShare; actions?: ReactNode }) {
  const { t } = useTranslation();
  const name = share.sender.display_name || share.sender.username;
  return (
    <li className="flex gap-3 rounded-md border p-3">
      <Thumbnail shareId={share.id} hasThumb={share.video.has_thumbnail} />
      <div className="grid min-w-0 flex-1 content-start gap-1">
        <Link
          to="/shares/$id"
          params={{ id: share.id }}
          className="truncate font-medium hover:underline"
        >
          {share.video.title || t('lists.open')}
        </Link>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Avatar user={share.sender} size={20} />
          <span className="truncate">{t('feed.from', { name })}</span>
          {!share.watched_at && (
            <span className="rounded bg-primary/15 px-1.5 text-xs font-medium text-primary">
              {t('lists.unwatched')}
            </span>
          )}
          {share.reaction && (
            <span aria-label={t(`reactions.${share.reaction}`)}>{share.reaction}</span>
          )}
        </div>
        {share.note && <p className="line-clamp-2 text-sm">{share.note}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {share.watched_at && (
            <span>{t('lists.watchedAt', { when: formatRelative(share.watched_at) })}</span>
          )}
          {share.reply_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3" aria-hidden />
              {t('lists.replies', { count: share.reply_count })}
            </span>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-col gap-2">{actions}</div>}
    </li>
  );
}
