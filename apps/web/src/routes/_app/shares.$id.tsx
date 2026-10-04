// A share's private conversation (FR-ENG-01/02, BR-ENG-1): video, note, reaction, replies.
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApiInfiniteQuery, useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import {
  deleteReply,
  getShare,
  getShareMedia,
  listReplies,
  postReply,
  type Reply,
} from '@vidfriends/contracts';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/i18n';
import { ReactionBar } from '@/features/shares/reaction-bar';
import { errorMessage } from '@/lib/errors';
import { reportProgress } from '@/lib/progress';
import { useQuery } from '@tanstack/react-query';
import { meQuery } from '@/lib/session';

export const Route = createFileRoute('/_app/shares/$id')({ component: SharePage });

function SharePage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const share = useApiQuery(getShare, { params: { id } });
  const media = useApiQuery(
    getShareMedia,
    { params: { id } },
    { staleTime: 10 * 60_000, retry: false },
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const s = share.data?.share;
  const isRecipient = s?.role === 'recipient';

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isRecipient) return;
    const send = () =>
      v.currentTime > 0 &&
      void reportProgress(id, {
        position_ms: Math.round(v.currentTime * 1000),
        ...(Number.isFinite(v.duration) ? { duration_ms: Math.round(v.duration * 1000) } : {}),
      });
    const timer = setInterval(() => !v.paused && send(), 5000);
    v.addEventListener('pause', send);
    return () => {
      clearInterval(timer);
      v.removeEventListener('pause', send);
      send();
    };
  }, [id, isRecipient, media.data?.media_url]);

  if (share.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (share.isError || !s)
    return <Alert variant="destructive">{errorMessage(t, share.error)}</Alert>;
  const other = isRecipient ? s.sender : s.recipient;
  const otherName = other.display_name || other.username;
  return (
    <div className="grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold">{t('share.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('share.private', { name: otherName })}</p>
      <Card className="grid gap-3 p-4">
        <p className="font-medium">{s.video.title}</p>
        {media.data?.media_url ? (
          // Sources provide no captions in v1 (TDD §4).
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={media.data.media_url}
            poster={media.data.thumb_url ?? undefined}
            controls
            playsInline
            className="max-h-[60vh] w-full rounded-md bg-black"
            aria-label={s.video.title || t('share.title')}
          />
        ) : (
          <div className="grid gap-2">
            {media.data?.thumb_url && (
              <img src={media.data.thumb_url} alt="" className="max-h-60 rounded object-contain" />
            )}
            {s.video.source_url && (
              <a
                href={s.video.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline' })}
                onClick={() =>
                  isRecipient && void reportProgress(id, { position_ms: 0, opened_original: true })
                }
              >
                <ExternalLink aria-hidden />
                {t('feed.openOriginal')}
              </a>
            )}
          </div>
        )}
        {s.note && (
          <p className="text-sm">
            <span className="font-medium">
              {t('share.note', { name: s.sender.display_name || s.sender.username })}:{' '}
            </span>
            {s.note}
          </p>
        )}
        {isRecipient ? (
          <div className="rounded-md bg-neutral-900 p-2">
            <ReactionBar shareId={id} initial={s.reaction} />
          </div>
        ) : (
          s.reaction && (
            <p aria-label={t(`reactions.${s.reaction}`)} className="text-2xl">
              {s.reaction}
            </p>
          )
        )}
      </Card>
      <Conversation shareId={id} otherName={otherName} />
    </div>
  );
}

function Conversation({ shareId, otherName }: { shareId: string; otherName: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useQuery(meQuery());
  const replies = useApiInfiniteQuery(
    listReplies,
    { params: { id: shareId }, query: { limit: 50 } },
    { refetchInterval: 15_000 },
  );
  const items = (replies.data?.pages ?? []).flatMap((p) => p.items as Reply[]);
  const [body, setBody] = useState('');
  const inputId = useId();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [listReplies.id] });
  const post = useApiMutation(postReply, {
    onSuccess: async () => {
      setBody('');
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  const remove = useApiMutation(deleteReply, {
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  return (
    <Card className="grid gap-3 p-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('share.noReplies')}</p>
      ) : (
        <ol className="grid gap-2" aria-label={t('share.title')} aria-live="polite">
          {items.map((r) => {
            const mine = r.author.id === me.data?.user.id;
            return (
              <li key={r.id} className={`flex gap-2 ${mine ? 'flex-row-reverse text-right' : ''}`}>
                <Avatar user={r.author} size={28} />
                <div
                  className={`grid max-w-[80%] gap-0.5 rounded-lg px-3 py-2 ${mine ? 'bg-primary/15' : 'bg-muted'}`}
                >
                  <span className="text-xs text-muted-foreground">
                    {mine ? t('share.you') : r.author.display_name || r.author.username} ·{' '}
                    <time dateTime={r.created_at}>{formatDateTime(r.created_at)}</time>
                  </span>
                  {r.deleted ? (
                    <em className="text-sm text-muted-foreground">{t('share.replyDeleted')}</em>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
                  )}
                </div>
                {mine && !r.deleted && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('share.deleteReply')}
                    onClick={() => remove.mutate({ params: { id: r.id } })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate({ params: { id: shareId }, body: { body: body.trim() } });
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t('share.replyLabel')} ({t('share.with', { name: otherName })})
        </label>
        <textarea
          id={inputId}
          value={body}
          maxLength={1000}
          rows={2}
          placeholder={t('share.replyPlaceholder')}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-10 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={post.isPending || !body.trim()}>
          {t('share.send')}
        </Button>
      </form>
    </Card>
  );
}
