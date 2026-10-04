import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import { adminRunRetention, adminStorage } from '@vidfriends/contracts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatBytes, formatRelative } from '@/i18n';
import { errorMessage } from '@/lib/errors';

// WF-ADM-5: totals, per-member bytes, counts by video state and the next retention run.
export const Route = createFileRoute('/_app/admin/storage')({
  component: AdminStorage,
});

function AdminStorage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useApiQuery(adminStorage);
  const run = useApiMutation(adminRunRetention, {
    onSuccess: async () => {
      toast.success(t('admin.retentionQueued'));
      await queryClient.invalidateQueries({ queryKey: [adminStorage.id] });
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  if (query.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (query.isError) return <Alert variant="destructive">{errorMessage(t, query.error)}</Alert>;
  const s = query.data;
  const when = formatRelative(s.next_retention_run);
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <CardTitle>{t('admin.totalBytes', { bytes: formatBytes(s.total_bytes) })}</CardTitle>
        <CardDescription>
          {s.retention_days > 0
            ? t('admin.retention', { days: s.retention_days, when })
            : t('admin.retentionOff', { when })}
        </CardDescription>
        <div>
          <Button
            variant="outline"
            disabled={run.isPending}
            onClick={() => run.mutate({ body: {} })}
          >
            {t('admin.runRetention')}
          </Button>
        </div>
      </Card>
      <Card className="grid gap-3">
        <CardTitle>{t('admin.byState')}</CardTitle>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(s.videos_by_state).map(([state, count]) => (
            <div key={state} className="rounded-md border p-2">
              <dt className="text-xs text-muted-foreground">{t(`admin.videoState.${state}`)}</dt>
              <dd className="text-lg font-semibold">{count}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="grid gap-3">
        <CardTitle>{t('admin.perUser')}</CardTitle>
        <ul className="grid gap-2">
          {s.per_user.map(({ user, bytes }) => (
            <li key={user.id} className="flex items-center gap-3">
              <Avatar user={user} size={28} />
              <span className="flex-1">{user.display_name || user.username}</span>
              <span className="tabular-nums text-muted-foreground">{formatBytes(bytes)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
