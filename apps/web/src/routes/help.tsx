import { createFileRoute } from '@tanstack/react-router';
import { InfoPage } from '@/components/info-page';

// Member help (M5-T8): how friends, sending, watching and notifications work.
export const Route = createFileRoute('/help')({
  component: () => <InfoPage ns="help" />,
});
