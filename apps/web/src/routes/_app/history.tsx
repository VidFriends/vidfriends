import { createFileRoute } from '@tanstack/react-router';
import { useApiQuery } from '@vidfriends/api-client/react';
import { getHistory, listFriends } from '@vidfriends/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ReceivedList } from '@/features/shares/received-list';

export const Route = createFileRoute('/_app/history')({ component: HistoryPage });

function HistoryPage() {
  const { t } = useTranslation();
  const friends = useApiQuery(listFriends);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sender, setSender] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">{t('lists.historyTitle')}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('lists.historyFilterTitle')}>
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label={t('lists.historyFilterSender')}>
          <select
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('lists.anySender')}</option>
            {(friends.data?.items ?? []).map((f) => (
              <option key={f.user.id} value={f.user.id}>
                {f.user.display_name || f.user.username}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ReceivedList
        route={getHistory}
        query={{ q: debounced || undefined, sender: sender || undefined }}
        label={t('lists.historyTitle')}
        empty={t('lists.historyEmpty')}
      />
    </div>
  );
}
