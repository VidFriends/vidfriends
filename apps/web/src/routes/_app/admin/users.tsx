import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApiInfiniteQuery, useApiMutation } from '@vidfriends/api-client/react';
import {
  adminDeleteUser,
  adminListUsers,
  adminPasswordReset,
  adminUpdateUser,
  type AdminUser,
} from '@vidfriends/contracts';
import { Check, Copy } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatBytes, formatRelative } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { meQuery } from '@/lib/session';

export const Route = createFileRoute('/_app/admin/users')({
  component: AdminUsers,
});

const MB = 1024 * 1024;
type StatusFilter = 'all' | 'active' | 'suspended';

function AdminUsers() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const search = useDeferredValue(q.trim());
  const query = useApiInfiniteQuery(adminListUsers, {
    query: {
      limit: 25,
      ...(search ? { q: search } : {}),
      ...(status !== 'all' ? { status } : {}),
    },
  });
  const items = (query.data?.pages ?? []).flatMap((p) => p.items as AdminUser[]);
  return (
    <Card className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label={t('admin.search')}>
          <Input type="search" value={q} maxLength={50} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label={t('admin.statusFilter')}>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">{t('admin.statusAll')}</option>
            <option value="active">{t('admin.status.active')}</option>
            <option value="suspended">{t('admin.status.suspended')}</option>
          </select>
        </Field>
      </div>
      {query.isPending ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : query.isError ? (
        <Alert variant="destructive">{errorMessage(t, query.error)}</Alert>
      ) : !items.length ? (
        <CardDescription>{t('admin.usersEmpty')}</CardDescription>
      ) : (
        <ul className="grid gap-2" aria-label={t('admin.users')}>
          {items.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <div>
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {t('common.loadMore')}
          </Button>
        </div>
      )}
    </Card>
  );
}

type Pending = 'suspend' | 'delete' | 'quota' | null;

function UserRow({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useQuery(meQuery());
  const isSelf = me.data?.user.id === user.id;
  const name = user.display_name || user.username;
  const [pending, setPending] = useState<Pending>(null);
  const [reset, setReset] = useState<{ url: string; expires: string } | null>(null);
  const [quota, setQuota] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: [adminListUsers.id] });
  const onError = (err: unknown) => toast.error(errorMessage(t, err));
  const update = useApiMutation(adminUpdateUser, {
    onSuccess: async () => {
      setPending(null);
      toast.success(t('admin.updated'));
      await refresh();
      if (isSelf) await queryClient.invalidateQueries({ queryKey: meQuery().queryKey });
    },
    onError,
  });
  const remove = useApiMutation(adminDeleteUser, {
    onSuccess: async () => {
      setPending(null);
      toast.success(t('admin.deletedUser'));
      await refresh();
    },
    onError,
  });
  const resetLink = useApiMutation(adminPasswordReset, {
    onSuccess: (res) => setReset({ url: res.reset_url, expires: res.expires_at }),
    onError,
  });
  const params = { id: user.id };
  const quotaNum = quota.trim() === '' ? null : Number(quota);
  const quotaError =
    quotaNum === null || (Number.isInteger(quotaNum) && quotaNum >= 0) ? undefined : '≥ 0';
  return (
    <li className="grid gap-2 rounded-md border p-3" data-testid={`admin-user-${user.username}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {name} <span className="text-muted-foreground">@{user.username}</span>{' '}
          {isSelf && <span className="text-muted-foreground">{t('admin.you')}</span>}
        </span>
        <span className="flex gap-2 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5">{t(`admin.role.${user.role}`)}</span>
          <span
            className={
              user.status === 'suspended'
                ? 'rounded-full bg-destructive px-2 py-0.5 text-destructive-foreground'
                : 'rounded-full bg-muted px-2 py-0.5'
            }
          >
            {t(`admin.status.${user.status}`)}
          </span>
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('admin.joined', { when: formatRelative(user.created_at) })} ·{' '}
        {user.last_active_at
          ? t('admin.lastActive', { when: formatRelative(user.last_active_at) })
          : t('admin.neverActive')}{' '}
        · {t('admin.storageUsed', { bytes: formatBytes(user.storage_bytes) })} ·{' '}
        {t('admin.counts', { sent: user.shares_sent, received: user.shares_received })}
        {user.quota_bytes_override !== null &&
          ` · ${t('admin.quotaOverride', { bytes: formatBytes(user.quota_bytes_override) })}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {user.status === 'active' ? (
          !isSelf && (
            <Button variant="outline" size="sm" onClick={() => setPending('suspend')}>
              {t('admin.suspend')}
            </Button>
          )
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ params, body: { status: 'active' } })}
          >
            {t('admin.unsuspend')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              params,
              body: { role: user.role === 'admin' ? 'member' : 'admin' },
            })
          }
        >
          {user.role === 'admin' ? t('admin.demote') : t('admin.promote')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setQuota(
              user.quota_bytes_override === null
                ? ''
                : String(Math.round(user.quota_bytes_override / MB)),
            );
            setPending('quota');
          }}
        >
          {t('admin.quotaTitle')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={resetLink.isPending}
          onClick={() => resetLink.mutate({ params })}
        >
          {t('admin.resetLink')}
        </Button>
        {!isSelf && (
          <Button variant="destructive" size="sm" onClick={() => setPending('delete')}>
            {t('admin.delete')}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={pending === 'suspend'}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('admin.suspend')}
        description={t('admin.suspendConfirm', { name })}
        confirmLabel={t('admin.suspend')}
        pending={update.isPending}
        onConfirm={() => update.mutate({ params, body: { status: 'suspended' } })}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('admin.delete')}
        description={t('admin.deleteConfirm', { name })}
        confirmLabel={t('admin.delete')}
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ params })}
      />
      <Dialog open={pending === 'quota'} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogTitle>{t('admin.quotaTitle')}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (quotaError) return;
              update.mutate({
                params,
                body: { quota_bytes_override: quotaNum === null ? null : quotaNum * MB },
              });
            }}
          >
            <Field label={t('admin.quotaLabel')} error={quotaError}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button type="submit" disabled={update.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={reset !== null} onOpenChange={(o) => !o && setReset(null)}>
        <DialogContent>
          <DialogTitle>{t('admin.resetTitle', { name })}</DialogTitle>
          <DialogDescription>
            {reset && t('admin.resetHelp', { name, when: formatRelative(reset.expires) })}
          </DialogDescription>
          {reset && <CopyField url={reset.url} />}
          <DialogClose asChild>
            <Button variant="outline">{t('common.close')}</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CopyField({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={url}
        aria-label={t('admin.resetLink')}
        onFocus={(e) => e.currentTarget.select()}
        data-testid="reset-url"
      />
      <Button
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        <span>{copied ? t('common.copied') : t('common.copy')}</span>
      </Button>
    </div>
  );
}
