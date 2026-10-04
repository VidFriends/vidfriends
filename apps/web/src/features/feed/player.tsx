// Vertical feed player (FRD §7 playback rules, TDD §4, FR-FEED-05/06, NFR-A11Y-01).
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useApi, useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import { getFeed, getShareMedia, updateShare, type FeedItem } from '@vidfriends/contracts';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  MessageCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { ReactionBar } from '@/features/shares/reaction-bar';
import { errorMessage } from '@/lib/errors';
import { reportProgress } from '@/lib/progress';
import { cn } from '@/lib/utils';

const UNMUTED_KEY = 'vf-unmuted';
const PROGRESS_INTERVAL_MS = 5000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function readUnmuted(): boolean {
  try {
    return sessionStorage.getItem(UNMUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function FeedPlayer() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const feed = useInfiniteQuery({
    queryKey: ['feed-player'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.call(getFeed, {
        query: { limit: 10, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    // The visible list stays stable while watching; new arrivals are offered by the banner below.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const items = (feed.data?.pages ?? []).flatMap((p) => p.items);

  // FR-NOTIF-05: poll the head of the feed (focus + 60 s) and offer new arrivals without reordering.
  const head = useQuery({
    queryKey: ['feed-head'],
    queryFn: ({ signal }) => api.call(getFeed, { query: { limit: 1 }, signal }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const headItem = head.data?.items[0];
  const hasNew = Boolean(
    headItem &&
    headItem.section === 'unwatched' &&
    !items.some((i) => i.id === headItem.id) &&
    feed.isSuccess,
  );

  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(() => !readUnmuted());
  const [autoplay] = useState(() => !prefersReducedMotion());
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      try {
        sessionStorage.setItem(UNMUTED_KEY, m ? '1' : '0');
      } catch {
        // per-session preference only
      }
      return !m;
    });
  }, []);

  // IntersectionObserver picks the active slide (TDD §4).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  // Load more when approaching the end.
  useEffect(() => {
    if (active >= items.length - 3 && feed.hasNextPage && !feed.isFetchingNextPage)
      void feed.fetchNextPage();
  }, [active, items.length, feed]);

  const goTo = useCallback((index: number) => {
    const el = slideRefs.current[Math.max(0, Math.min(index, slideRefs.current.length - 1))];
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, []);

  // Keyboard: ↑/↓ or j/k move, Space plays/pauses, m mutes (TDD §4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goTo(active + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goTo(active - 1);
      } else if (e.key === 'm') {
        toggleMute();
      } else if (e.key === ' ' && target?.tagName !== 'BUTTON' && target?.tagName !== 'VIDEO') {
        const video = slideRefs.current[active]?.querySelector('video');
        if (video) {
          e.preventDefault();
          if (video.paused) void video.play().catch(() => {});
          else video.pause();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, goTo, toggleMute]);

  if (feed.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (feed.isError) return <p role="alert">{errorMessage(t, feed.error)}</p>;
  if (!items.length) {
    return (
      <div className="grid gap-4">
        <p className="text-muted-foreground">{t('feed.empty')}</p>
        {hasNew && (
          <div>
            <Button onClick={() => void queryClient.resetQueries({ queryKey: ['feed-player'] })}>
              {t('feed.newVideos')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const firstWatched = items.findIndex((i) => i.section === 'watched');
  const showCaughtUpAtEnd = firstWatched === -1 && !feed.hasNextPage;
  return (
    <div className="relative mx-auto w-full max-w-md">
      <p className="sr-only">{t('feed.keyboardHelp')}</p>
      {hasNew && (
        <Button
          className="absolute left-1/2 top-3 z-20 -translate-x-1/2 shadow-lg"
          onClick={async () => {
            await queryClient.resetQueries({ queryKey: ['feed-player'] });
            setActive(0);
            containerRef.current?.scrollTo({ top: 0 });
          }}
        >
          {t('feed.newVideos')}
        </Button>
      )}
      <div
        ref={containerRef}
        className="h-[calc(100dvh-9rem)] snap-y snap-mandatory overflow-y-scroll rounded-lg bg-black"
        aria-label={t('feed.label')}
        role="feed"
        aria-busy={feed.isFetchingNextPage}
      >
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index === firstWatched && <CaughtUp />}
            <article
              ref={(el) => {
                slideRefs.current[index] = el;
              }}
              data-index={index}
              aria-posinset={index + 1}
              aria-setsize={feed.hasNextPage ? -1 : items.length}
              aria-label={t('feed.position', { index: index + 1, total: items.length })}
              className="relative h-[calc(100dvh-9rem)] snap-start snap-always"
              data-testid="feed-item"
              data-share-id={item.id}
            >
              <Slide
                item={item}
                active={index === active}
                near={Math.abs(index - active) <= 1}
                preloadNext={index === active + 1}
                muted={muted}
                autoplay={autoplay}
                onToggleMute={toggleMute}
              />
            </article>
          </Fragment>
        ))}
        {showCaughtUpAtEnd && <CaughtUp />}
        {feed.isFetchingNextPage && (
          <p className="p-4 text-center text-white">{t('feed.loadingMore')}</p>
        )}
      </div>
    </div>
  );
}

function CaughtUp() {
  const { t } = useTranslation();
  return (
    <article
      aria-label={t('feed.caughtUp')}
      className="flex h-40 snap-start flex-col items-center justify-center gap-1 text-center text-white"
    >
      <p className="text-lg font-semibold">{t('feed.caughtUp')}</p>
      <p className="text-sm text-white/70">{t('feed.caughtUpHelp')}</p>
    </article>
  );
}

function Slide({
  item,
  active,
  near,
  preloadNext,
  muted,
  autoplay,
  onToggleMute,
}: {
  item: FeedItem;
  active: boolean;
  near: boolean;
  preloadNext: boolean;
  muted: boolean;
  autoplay: boolean;
  onToggleMute: () => void;
}) {
  const { t } = useTranslation();
  const playable = item.video.state === 'ready';
  // Media URLs are fetched only for the active slot and its neighbours, and refreshed before expiry.
  const media = useApiQuery(
    getShareMedia,
    { params: { id: item.id } },
    { enabled: near, staleTime: 10 * 60_000 },
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const name = item.sender.display_name || item.sender.username;

  // Only the active item plays (FRD §7).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active && autoplay) void v.play().catch(() => {});
    if (!active) v.pause();
  }, [active, autoplay, media.data?.media_url]);

  // Progress every 5 s while playing, plus on pause and when the page is hidden (TDD §4).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active) return;
    const send = () => {
      if (v.currentTime > 0) {
        void reportProgress(item.id, {
          position_ms: Math.round(v.currentTime * 1000),
          ...(Number.isFinite(v.duration) ? { duration_ms: Math.round(v.duration * 1000) } : {}),
        });
      }
    };
    const timer = setInterval(() => !v.paused && send(), PROGRESS_INTERVAL_MS);
    const onHide = () => document.visibilityState === 'hidden' && send();
    v.addEventListener('pause', send);
    v.addEventListener('ended', send);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      v.removeEventListener('pause', send);
      v.removeEventListener('ended', send);
      document.removeEventListener('visibilitychange', onHide);
      send();
    };
  }, [active, item.id, media.data?.media_url]);

  return (
    <div className="relative flex h-full w-full items-center justify-center text-white">
      {playable && near && media.data?.media_url ? (
        // Sources provide no captions in v1 (TDD §4); the player has an accessible name.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          src={media.data.media_url}
          poster={media.data.thumb_url ?? undefined}
          muted={muted}
          playsInline
          controls
          preload={active || preloadNext ? 'auto' : 'metadata'}
          aria-label={item.video.title || t('feed.from', { name })}
          className="h-full w-full object-contain"
          data-testid="feed-video"
          onError={() => void media.refetch()}
        />
      ) : !playable ? (
        <LinkCard item={item} thumb={media.data?.thumb_url ?? null} />
      ) : (
        <div className="h-full w-full bg-neutral-900" aria-hidden />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid gap-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-16">
        <div className="pointer-events-auto flex items-center gap-2">
          <Avatar user={item.sender} size={32} />
          <span className="font-semibold">{t('feed.from', { name })}</span>
        </div>
        {item.video.title && <p className="line-clamp-2 text-sm">{item.video.title}</p>}
        {item.note && <p className="line-clamp-3 text-sm italic">“{item.note}”</p>}
        {item.also_sent_by.length > 0 && (
          <p className="text-xs text-white/80">
            {t('feed.alsoSentBy', {
              names: item.also_sent_by.map((u) => u.display_name || u.username).join(', '),
            })}
          </p>
        )}
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
          <ReactionBar shareId={item.id} initial={item.reaction} />
          <div className="flex gap-1">
            <SaveButton item={item} />
            <Link
              to="/shares/$id"
              params={{ id: item.id }}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                'text-white hover:bg-white/20',
              )}
              aria-label={t('feed.conversation', { count: item.reply_count })}
            >
              <MessageCircle aria-hidden />
            </Link>
            {playable && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={onToggleMute}
                aria-pressed={!muted}
                aria-label={muted ? t('feed.unmute') : t('feed.mute')}
              >
                {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveButton({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(item.saved);
  const mutation = useApiMutation(updateShare);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-white hover:bg-white/20"
      aria-pressed={saved}
      aria-label={saved ? t('feed.saved') : t('feed.save')}
      onClick={() => {
        const next = !saved;
        setSaved(next); // optimistic, rolled back on failure (SDD §5)
        mutation.mutate(
          { params: { id: item.id }, body: { saved: next } },
          {
            onError: (err) => {
              setSaved(!next);
              toast.error(errorMessage(t, err));
            },
          },
        );
      }}
    >
      {saved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
    </Button>
  );
}

/** FR-FEED-06: link-only and expired videos render as a card with "Open original". */
function LinkCard({ item, thumb }: { item: FeedItem; thumb: string | null }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-start gap-3 overflow-hidden p-6 pb-56 pt-10 text-center"
      data-testid="link-card"
    >
      {thumb && (
        <img src={thumb} alt="" className="max-h-[35%] min-h-0 rounded-md object-contain" />
      )}
      {item.video.title && <p className="text-lg font-semibold">{item.video.title}</p>}
      <p className="text-sm text-white/80">
        {item.video.state === 'expired' ? t('feed.expired') : t('feed.linkOnly')}
      </p>
      {item.video.source_url && (
        <a
          href={item.video.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants()}
          // Opening the original counts as watched (BR-SHR-3).
          onClick={() => void reportProgress(item.id, { position_ms: 0, opened_original: true })}
        >
          <ExternalLink aria-hidden />
          {t('feed.openOriginal')}
        </a>
      )}
    </div>
  );
}
