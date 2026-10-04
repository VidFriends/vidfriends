import { createFileRoute } from '@tanstack/react-router';
import { useApiInfiniteQuery } from '@vidfriends/api-client/react';
import { adminAudit, type AuditEntry } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/i18n';
import { errorMessage } from '@/lib/errors';

// WF-ADM-6: newest first, filterable by actor (id), action and date.
export const Route = createFileRoute('/_app/admin/audit')({
  component: AdminAudit,
});

type Filters = { action?: string; actor?: string; before?: string };

function AdminAudit() {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const [before, setBefore] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const query = useApiInfiniteQuery(adminAudit, { query: { limit: 50, ...filters } });
  const items = (query.data?.pages ?? []).flatMap((p) => p.items as AuditEntry[]);
  return (
    <Card className="grid gap-4">
      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters((f) => ({
            ...(f.actor ? { actor: f.actor } : {}),
            ...(action.trim() ? { action: action.trim() } : {}),
            ...(before ? { before: new Date(`${before}T23:59:59.999`).toISOString() } : {}),
          }));
        }}
      >
        <Field label={t('admin.auditAction')}>
          <Input value={action} maxLength={60} onChange={(e) => setAction(e.target.value)} />
        </Field>
        <Field label={t('admin.auditBefore')}>
          <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} />
        </Field>
        <Button type="submit">{t('admin.filter')}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAction('');
            setBefore('');
            setFilters({});
          }}
        >
          {t('admin.clear')}
        </Button>
      </form>
      {query.isPending ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : query.isError ? (
        <Alert variant="destructive">{errorMessage(t, query.error)}</Alert>
      ) : !items.length ? (
        <CardDescription>{t('admin.auditEmpty')}</CardDescription>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.auditTime')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.auditActor')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.auditAction')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.auditTarget')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="whitespace-nowrap py-2 pr-3">{formatDateTime(e.created_at)}</td>
                  <td className="py-2 pr-3">
                    {e.actor ? (
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline"
                        onClick={() => setFilters((f) => ({ ...f, actor: e.actor!.id }))}
                      >
                        {e.actor.display_name || e.actor.username}
                      </button>
                    ) : (
                      t('admin.auditSystem')
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono">{e.action}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {e.target_type ? `${e.target_type}:${e.target_id ?? ''}` : ''}
                  </td>
                  <td className="py-2 font-mono text-xs">{e.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
