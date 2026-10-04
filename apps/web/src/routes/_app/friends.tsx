// Friends (FR-FRND-01..05, M2-T5): search, requests, friends, blocked, with optimistic actions.
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  listBlocks,
  listFriendRequests,
  listFriends,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
  type Relationship,
  type RelationshipState,
  type RouteDef,
} from '@vidfriends/contracts';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { GroupsCard } from '@/features/friends/groups-card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/friends')({
  component: FriendsPage,
});

type Action = 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';

const ROUTES: Record<Action, RouteDef> = {
  request: sendFriendRequest,
  accept: acceptFriendRequest,
  decline: declineFriendRequest,
  cancel: cancelFriendRequest,
  remove: removeFriend,
  block: blockUser,
  unblock: unblockUser,
};

/** The state a relationship moves to, used for the optimistic update (FRD §4). */
const NEXT: Record<Action, RelationshipState> = {
  request: 'request_sent',
  accept: 'friends',
  decline: 'none',
  cancel: 'none',
  remove: 'none',
  block: 'blocked',
  unblock: 'none',
};

const FRIEND_QUERIES = [listFriends.id, listFriendRequests.id, listBlocks.id, searchUsers.id];

/** Which state a list query holds; search results keep every state. */
function listState(key: QueryKey): RelationshipState | null {
  if (key[0] === listFriends.id) return 'friends';
  if (key[0] === listBlocks.id) return 'blocked';
  if (key[0] === listFriendRequests.id) {
    const q = key[2] as { direction?: string } | null;
    return q?.direction === 'out' ? 'request_sent' : 'request_received';
  }
  return null;
}

function useRelationshipAction() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const run = async (action: Action, userId: string) => {
    const filters = {
      predicate: (q: { queryKey: QueryKey }) => FRIEND_QUERIES.includes(q.queryKey[0] as string),
    };
    await queryClient.cancelQueries(filters);
    const snapshot = queryClient.getQueriesData(filters);
    // Optimistic update with rollback on failure (SDD §5). It never fabricates server data: an item
    // only changes state, or leaves a list it no longer belongs to; the refetch fills in the rest.
    for (const [key] of snapshot) {
      const kept = listState(key);
      queryClient.setQueryData<{ items: Relationship[] }>(key, (old) =>
        old
          ? {
              ...old,
              items: old.items
                .map((r) => (r.user.id === userId ? { ...r, state: NEXT[action] } : r))
                .filter((r) => kept === null || r.user.id !== userId || r.state === kept),
            }
          : old,
      );
    }
    try {
      const route = ROUTES[action];
      await api.call(
        route,
        (route.body ? { body: { user_id: userId } } : { params: { user_id: userId } }) as never,
      );
      toast.success(t(`friends.done.${action}`));
    } catch (err) {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      toast.error(errorMessage(t, err));
    } finally {
      await queryClient.invalidateQueries(filters);
    }
  };
  return { run };
}

function FriendsPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('friends.title')}</h1>
        <p className="text-muted-foreground">{t('friends.intro')}</p>
      </div>
      <SearchCard />
      <ListCard
        title={t('friends.incoming')}
        empty={t('friends.noIncoming')}
        route={listFriendRequests}
        query={{ direction: 'in' }}
      />
      <ListCard
        title={t('friends.friendsList')}
        empty={t('friends.noFriends')}
        route={listFriends}
      />
      <GroupsCard />
      <ListCard
        title={t('friends.outgoing')}
        empty={t('friends.noOutgoing')}
        route={listFriendRequests}
        query={{ direction: 'out' }}
      />
      <ListCard title={t('friends.blocked')} empty={t('friends.noBlocked')} route={listBlocks} />
    </div>
  );
}

function SearchCard() {
  const { t } = useTranslation();
  const id = useId();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);
  const enabled = debounced.length >= 2;
  const results = useApiQuery(searchUsers, { query: { q: debounced } }, { enabled });
  return (
    <Card className="grid gap-3">
      <label htmlFor={id} className="text-lg font-semibold">
        {t('friends.searchLabel')}
      </label>
      <Input
        id={id}
        type="search"
        value={q}
        placeholder={t('friends.searchPlaceholder')}
        onChange={(e) => setQ(e.target.value)}
        aria-describedby={`${id}-help`}
        autoComplete="off"
        autoCapitalize="none"
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {t('friends.searchHelp')}
      </p>
      <div aria-live="polite">
        {enabled && results.isError && (
          <Alert variant="destructive">{errorMessage(t, results.error)}</Alert>
        )}
        {enabled && results.data && results.data.items.length === 0 && (
          <CardDescription>{t('friends.searchEmpty')}</CardDescription>
        )}
        {enabled && results.data && results.data.items.length > 0 && (
          <PeopleList items={results.data.items} label={t('friends.searchLabel')} />
        )}
      </div>
    </Card>
  );
}

function ListCard({
  title,
  empty,
  route,
  query,
}: {
  title: string;
  empty: string;
  route: RouteDef;
  query?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const list = useApiQuery(route, query ? { query } : {});
  const items = ((list.data as { items?: Relationship[] } | undefined)?.items ??
    []) as Relationship[];
  return (
    <Card className="grid gap-3">
      <CardTitle>{title}</CardTitle>
      {list.isPending ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : list.isError ? (
        <Alert variant="destructive">{errorMessage(t, list.error)}</Alert>
      ) : items.length === 0 ? (
        <CardDescription>{empty}</CardDescription>
      ) : (
        <PeopleList items={items} label={title} />
      )}
    </Card>
  );
}

function PeopleList({ items, label }: { items: Relationship[]; label: string }) {
  return (
    <ul className="grid gap-2" aria-label={label}>
      {items.map((r) => (
        <PersonRow key={r.user.id} relationship={r} />
      ))}
    </ul>
  );
}

function PersonRow({ relationship }: { relationship: Relationship }) {
  const { t } = useTranslation();
  const { run } = useRelationshipAction();
  const { user, state } = relationship;
  const name = user.display_name || user.username;
  const button = (action: Action, variant: 'default' | 'outline' = 'outline') => (
    <Button key={action} size="sm" variant={variant} onClick={() => void run(action, user.id)}>
      {t(`friends.${action === 'request' ? 'add' : action}`)}
    </Button>
  );
  const actions: ReactNode[] = [];
  if (state === 'none') actions.push(button('request', 'default'));
  if (state === 'request_received') actions.push(button('accept', 'default'), button('decline'));
  if (state === 'request_sent') actions.push(button('cancel'));
  if (state === 'friends')
    actions.push(
      <Confirm
        key="remove"
        label={t('friends.remove')}
        title={t('friends.removeConfirmTitle', { name })}
        body={t('friends.removeConfirm')}
        onConfirm={() => run('remove', user.id)}
      />,
    );
  if (state === 'blocked') actions.push(button('unblock'));
  else
    actions.push(
      <Confirm
        key="block"
        label={t('friends.block')}
        title={t('friends.blockConfirmTitle', { name })}
        body={t('friends.blockConfirm')}
        destructive
        onConfirm={() => run('block', user.id)}
      />,
    );
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border p-3">
      <Avatar user={user} />
      <div className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-sm text-muted-foreground">
          @{user.username}
          {state !== 'none' && ` · ${t(`friends.state.${state}`)}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </li>
  );
}

function Confirm({
  label,
  title,
  body,
  destructive,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">{t('common.cancel')}</Button>
          </DialogClose>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
