import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApiInfiniteQuery, useApiMutation } from '@vidfriends/api-client/react';
import { createInvite, listInvites, revokeInvite, type Invite } from '@vidfriends/contracts';
import { Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatRelative } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { meQuery } from '@/lib/session';

export const Route = createFileRoute('/_app/invites')({
  component: InvitesPage,
});

function InvitesPage() {
  const { t } = useTranslation();
  const me = useQuery(meQuery());
  const isAdmin = me.data?.user.role === 'admin';
  const [showAll, setShowAll] = useState(false);
  const canInvite = me.data?.settings_summary.can_invite ?? false;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('invites.title')}</h1>
        <p className="text-muted-foreground">{t('invites.intro')}</p>
      </div>
      {canInvite ? <CreateInviteCard /> : <Alert>{t('invites.notAllowed')}</Alert>}
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{showAll ? t('invites.listTitleAll') : t('invites.listTitle')}</CardTitle>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
              <Label htmlFor="show-all">{t('invites.showAll')}</Label>
            </div>
          )}
        </div>
        <InviteList scope={showAll ? 'all' : 'mine'} />
      </Card>
    </div>
  );
}

function CreateInviteCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [maxUses, setMaxUses] = useState('1');
  const [days, setDays] = useState('7');
  const [autoFriend, setAutoFriend] = useState(true);
  const [created, setCreated] = useState<{ joinUrl: string } | null>(null);
  const mutation = useApiMutation(createInvite, {
    onSuccess: async (res) => {
      setCreated({ joinUrl: res.join_url });
      await queryClient.invalidateQueries({ queryKey: [listInvites.id] });
    },
  });
  const maxUsesNum = Number(maxUses);
  const daysNum = Number(days);
  const usesError =
    Number.isInteger(maxUsesNum) && maxUsesNum >= 1 && maxUsesNum <= 50 ? undefined : '1–50';
  const daysError = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 90 ? undefined : '1–90';
  return (
    <Card>
      <CardTitle className="mb-4">{t('invites.createTitle')}</CardTitle>
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (usesError || daysError) return;
          mutation.mutate({
            body: { max_uses: maxUsesNum, expires_in_days: daysNum, auto_friend: autoFriend },
          });
        }}
      >
        {mutation.isError && (
          <Alert variant="destructive" className="sm:col-span-2">
            {errorMessage(t, mutation.error)}
          </Alert>
        )}
        <Field label={t('invites.maxUses')} error={usesError}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </Field>
        <Field label={t('invites.expiresInDays')} error={daysError}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
        <div className="flex items-start gap-3 sm:col-span-2">
          <Switch
            id="auto-friend"
            checked={autoFriend}
            onCheckedChange={setAutoFriend}
            aria-describedby="auto-friend-help"
          />
          <div className="grid gap-1">
            <Label htmlFor="auto-friend">{t('invites.autoFriend')}</Label>
            <p id="auto-friend-help" className="text-xs text-muted-foreground">
              {t('invites.autoFriendHelp')}
            </p>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {t('invites.create')}
          </Button>
        </div>
      </form>
      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogTitle>{t('invites.createdTitle')}</DialogTitle>
          <DialogDescription>{t('invites.createdHelp')}</DialogDescription>
          {created && <JoinLink url={created.joinUrl} />}
          <DialogClose asChild>
            <Button variant="outline">{t('common.close')}</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function JoinLink({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="join-url">{t('invites.joinUrl')}</Label>
        <div className="flex gap-2">
          <Input
            id="join-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="join-url"
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
      </div>
      <div className="flex justify-center rounded-md bg-white p-4">
        {/* The QR code encodes exactly the join URL (ADR-0013). */}
        <QRCodeSVG value={url} size={220} level="M" role="img" aria-label={t('invites.qrLabel')} />
      </div>
    </div>
  );
}

function InviteList({ scope }: { scope: 'mine' | 'all' }) {
  const { t } = useTranslation();
  const query = useApiInfiniteQuery(listInvites, { query: { scope, limit: 20 } });
  const items = (query.data?.pages ?? []).flatMap((p) => p.items as Invite[]);
  if (query.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (query.isError) return <Alert variant="destructive">{errorMessage(t, query.error)}</Alert>;
  if (!items.length) return <CardDescription>{t('invites.empty')}</CardDescription>;
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label={t('invites.listTitle')}>
        {items.map((invite) => (
          <InviteRow key={invite.id} invite={invite} showCreator={scope === 'all'} />
        ))}
      </ul>
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
    </div>
  );
}

function InviteRow({ invite, showCreator }: { invite: Invite; showCreator: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const revoke = useApiMutation(revokeInvite, {
    onSuccess: async () => {
      toast.success(t('invites.revoked'));
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: [listInvites.id] });
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div className="grid gap-0.5 text-sm">
        <span className="font-medium">
          {t(`invites.status.${invite.status}`)} ·{' '}
          {t('invites.uses', { uses: invite.uses, max: invite.max_uses })}
        </span>
        <span className="text-muted-foreground">
          {t('invites.expires', { when: formatRelative(invite.expires_at) })}
          {showCreator &&
            ` · ${t('invites.createdBy', { name: invite.created_by.display_name || invite.created_by.username })}`}
        </span>
      </div>
      {invite.status === 'active' && (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            {t('invites.revoke')}
          </Button>
          <DialogContent>
            <DialogTitle>{t('invites.revoke')}</DialogTitle>
            <DialogDescription>{t('invites.revokeConfirm')}</DialogDescription>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ params: { id: invite.id } })}
              >
                {t('invites.revoke')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}
