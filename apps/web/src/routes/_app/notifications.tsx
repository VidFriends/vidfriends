// In-app notifications (FR-NOTIF-01): newest first, mark read, links to the referenced item.
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useApiInfiniteQuery, useApiMutation } from '@vidfriends/api-client/react';
import { listNotifications, markRead, unreadCount, type Notification } from '@vidfriends/contracts';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/avatar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/notifications')({ component: NotificationsPage });

function target(n: Notification): { to: string; params?: Record<string, string> } {
  if (n.type === 'friend_request_received' || n.type === 'friend_request_accepted')
    return { to: '/friends' };
  if (n.share_id) return { to: '/shares/$id', params: { id: n.share_id } };
  return { to: '/' };
}

function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const list = useApiInfiniteQuery(
    listNotifications,
    { query: { limit: 30 } },
    { refetchInterval: 60_000 },
  );
  const items = (list.data?.pages ?? []).flatMap((p) => p.items as Notification[]);
  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) => [listNotifications.id, unreadCount.id].includes(q.queryKey[0] as string),
    });
  const read = useApiMutation(markRead, { onSuccess: refresh });
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('notifications.title')}</h1>
        <Button variant="outline" size="sm" onClick={() => read.mutate({ body: { all: true } })}>
          {t('notifications.markAll')}
        </Button>
      </div>
      {list.isPending ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : list.isError ? (
        <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>
      ) : !items.length ? (
        <p className="text-muted-foreground">{t('notifications.empty')}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t('notifications.title')}>
          {items.map((n) => {
            const name = n.actor
              ? n.actor.display_name || n.actor.username
              : t('notifications.someone');
            const link = target(n);
            return (
              <li
                key={n.id}
                className={`flex items-center gap-3 rounded-md border p-3 ${n.read_at ? '' : 'bg-primary/5'}`}
              >
                {n.actor ? <Avatar user={n.actor} size={36} /> : null}
                <Link
                  to={link.to}
                  params={link.params as never}
                  className="grid flex-1 gap-0.5 hover:underline"
                  onClick={() => !n.read_at && read.mutate({ body: { ids: [n.id] } })}
                >
                  <span className="text-sm">
                    {!n.read_at && <span className="sr-only">{t('notifications.unread')}: </span>}
                    {t(`notifications.types.${n.type}`, { name, emoji: n.data.emoji ?? '' })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(n.created_at)}
                  </span>
                </Link>
                {!n.read_at && <span className="size-2 rounded-full bg-primary" aria-hidden />}
              </li>
            );
          })}
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
