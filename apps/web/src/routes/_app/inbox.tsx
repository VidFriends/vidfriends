import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import { getInbox, updateShare } from '@vidfriends/contracts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ReceivedList } from '@/features/shares/received-list';
import { errorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/inbox')({ component: InboxPage });

function InboxPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const hide = useApiMutation(updateShare, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [getInbox.id] }),
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">{t('lists.inboxTitle')}</h1>
      <ReceivedList
        route={getInbox}
        label={t('lists.inboxTitle')}
        empty={t('lists.inboxEmpty')}
        actions={(s) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => hide.mutate({ params: { id: s.id }, body: { hidden: true } })}
          >
            {t('lists.hide')}
          </Button>
        )}
      />
    </div>
  );
}
