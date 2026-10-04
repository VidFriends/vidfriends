// Sent (FR-SHR-05, BR-FEED-5, BR-SHR-4): grouped by video and send time, per-recipient state.
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useApiInfiniteQuery, useApiMutation } from '@vidfriends/api-client/react';
import { getSent, unsendShare, type SentShare } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelative } from '@/i18n';
import { Thumbnail } from '@/features/shares/share-card';
import { errorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/sent')({ component: SentPage });

function group(items: SentShare[]): SentShare[][] {
  const groups = new Map<string, SentShare[]>();
  for (const s of items) {
    const key = `${s.video.id}|${s.created_at}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()];
}

function SentPage() {
  const { t } = useTranslation();
  const list = useApiInfiniteQuery(getSent, { query: { limit: 30 } }, { refetchInterval: 60_000 });
  const items = (list.data?.pages ?? []).flatMap((p) => p.items as SentShare[]);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">{t('lists.sentTitle')}</h1>
      {list.isPending ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : list.isError ? (
        <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>
      ) : !items.length ? (
        <p className="text-muted-foreground">{t('lists.sentEmpty')}</p>
      ) : (
        <ul className="grid gap-3" aria-label={t('lists.sentTitle')}>
          {group(items).map((g) => (
            <li key={`${g[0]!.video.id}-${g[0]!.created_at}`}>
              <Card className="grid gap-3 p-4">
                <div className="flex gap-3">
                  <Thumbnail shareId={g[0]!.id} hasThumb={g[0]!.video.has_thumbnail} />
                  <div className="grid content-start gap-1">
                    <p className="font-medium">{g[0]!.video.title || t('lists.open')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('lists.sentAt', { when: formatRelative(g[0]!.created_at) })}
                    </p>
                    {g[0]!.note && <p className="text-sm">“{g[0]!.note}”</p>}
                  </div>
                </div>
                <ul className="grid gap-2" aria-label={g[0]!.video.title}>
                  {g.map((s) => (
                    <RecipientRow key={s.id} share={s} />
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <div>
          <Button variant="outline" onClick={() => list.fetchNextPage()}>
            {t('common.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

function RecipientRow({ share }: { share: SentShare }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const unsend = useApiMutation(unsendShare, {
    onSuccess: async () => {
      toast.success(t('lists.unsent'));
      await queryClient.invalidateQueries({ queryKey: [getSent.id] });
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  const name = share.recipient.display_name || share.recipient.username;
  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
      data-testid="sent-recipient"
    >
      <Avatar user={share.recipient} size={28} />
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground" data-testid="sent-status">
        {share.status === 'watched' && share.watched_at
          ? t('lists.watchedAt', { when: formatRelative(share.watched_at) })
          : t(`lists.status.${share.status}`)}
      </span>
      {share.reaction && (
        <span aria-label={t(`reactions.${share.reaction}`)}>{share.reaction}</span>
      )}
      <Link
        to="/shares/$id"
        params={{ id: share.id }}
        className="text-primary underline-offset-4 hover:underline"
      >
        {t('lists.replies', { count: share.reply_count })}
      </Link>
      {share.last_reply && (
        <span className="w-full truncate text-xs text-muted-foreground">
          {t('lists.lastReply', { text: share.last_reply.body ?? t('lists.replyDeleted') })}
        </span>
      )}
      {share.status !== 'watched' && (
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setConfirm(true)}>
            {t('lists.unsend')}
          </Button>
          <DialogContent>
            <DialogTitle>{t('lists.unsend')}</DialogTitle>
            <DialogDescription>{t('lists.unsendConfirm')}</DialogDescription>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() =>
                  unsend.mutate(
                    { params: { id: share.id } },
                    { onSettled: () => setConfirm(false) },
                  )
                }
              >
                {t('lists.unsend')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}
