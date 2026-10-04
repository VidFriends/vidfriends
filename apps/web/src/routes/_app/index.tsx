import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { meQuery } from '@/lib/session';

export const Route = createFileRoute('/_app/')({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const me = useQuery(meQuery());
  const user = me.data?.user;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('home.title')}</h1>
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold">
          {t('home.welcome', { name: user?.display_name || user?.username })}
        </h2>
        <p className="text-muted-foreground">{t('home.intro')}</p>
        {me.data?.settings_summary.can_invite && (
          <div>
            <Link to="/invites" className={buttonVariants()}>
              {t('home.inviteCta')}
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
