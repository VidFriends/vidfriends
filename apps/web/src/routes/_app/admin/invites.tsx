import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardDescription } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

// WF-ADM-2: invites are managed on the shared invites page, where admins can show every invite.
export const Route = createFileRoute('/_app/admin/invites')({
  component: AdminInvites,
});

function AdminInvites() {
  const { t } = useTranslation();
  return (
    <Card className="grid gap-3">
      <CardDescription>{t('admin.invitesHelp')}</CardDescription>
      <div>
        <Link to="/invites" className={buttonVariants({ variant: 'outline' })}>
          {t('admin.invitesLink')}
        </Link>
      </div>
    </Card>
  );
}
