import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FeedPlayer } from '@/features/feed/player';

export const Route = createFileRoute('/_app/')({
  component: FeedPage,
});

function FeedPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      <h1 className="sr-only">{t('feed.title')}</h1>
      <FeedPlayer />
    </div>
  );
}
