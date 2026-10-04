// Shared paginated list for Inbox, Saved and History (BR-FEED-2..4).
import { useApiInfiniteQuery } from '@vidfriends/api-client/react';
import type { ReceivedShare, RouteDef } from '@vidfriends/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { ShareCard } from './share-card';

export function ReceivedList({
  route,
  query,
  label,
  empty,
  actions,
}: {
  route: RouteDef;
  query?: Record<string, string | number | undefined>;
  label: string;
  empty: string;
  actions?: (share: ReceivedShare) => ReactNode;
}) {
  const { t } = useTranslation();
  const list = useApiInfiniteQuery(
    route,
    { query: { limit: 20, ...(query ?? {}) } as never },
    { refetchInterval: 60_000 },
  );
  const items = (list.data?.pages ?? []).flatMap((p) => p.items as ReceivedShare[]);
  if (list.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (list.isError) return <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>;
  if (!items.length) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label={label}>
        {items.map((s) => (
          <ShareCard key={s.id} share={s} actions={actions?.(s)} />
        ))}
      </ul>
      {list.hasNextPage && (
        <div>
          <Button
            variant="outline"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
