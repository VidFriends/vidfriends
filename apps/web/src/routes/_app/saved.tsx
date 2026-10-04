import { createFileRoute } from '@tanstack/react-router';
import { getSaved } from '@vidfriends/contracts';
import { useTranslation } from 'react-i18next';
import { CollectionsCard } from '@/features/collections/collections-card';
import { ReceivedList } from '@/features/shares/received-list';

export const Route = createFileRoute('/_app/saved')({ component: SavedPage });

function SavedPage() {
  const { t } = useTranslation();
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold">{t('lists.savedTitle')}</h1>
      <CollectionsCard />
      <ReceivedList route={getSaved} label={t('lists.savedTitle')} empty={t('lists.savedEmpty')} />
    </div>
  );
}
