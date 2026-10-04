import { createFileRoute } from '@tanstack/react-router';
import { InfoPage } from '@/components/info-page';
import { instanceQuery } from '@/lib/session';

// Privacy disclosure (M5-T8, NFR-PRIV-*, ADR-0016): public, so people can read it before joining.
export const Route = createFileRoute('/privacy')({
  loader: ({ context }) => context.queryClient.ensureQueryData(instanceQuery()),
  component: PrivacyPage,
});

function PrivacyPage() {
  const instance = Route.useLoaderData();
  return (
    <InfoPage
      ns="privacy"
      values={{
        name: instance.name,
        days: instance.retention_days > 0 ? instance.retention_days : '∞',
      }}
    />
  );
}
