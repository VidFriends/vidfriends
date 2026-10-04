import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { currentUser } from '@/lib/session';

// The admin console (FR-ADM-01..05). The server enforces the admin role on every route; this guard
// only keeps members out of screens they could not use.
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async ({ context }) => {
    const me = await currentUser(context.queryClient);
    if (me?.user.role !== 'admin') throw redirect({ to: '/' });
  },
  component: AdminLayout,
});

const SECTIONS = [
  { to: '/admin/users', label: 'admin.users' },
  { to: '/admin/invites', label: 'admin.invites' },
  { to: '/admin/settings', label: 'admin.settings' },
  { to: '/admin/storage', label: 'admin.storage' },
  { to: '/admin/audit', label: 'admin.audit' },
] as const;

function AdminLayout() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.title')}</h1>
      <nav aria-label={t('admin.nav')} className="flex flex-wrap gap-1 border-b pb-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            activeProps={{ className: 'bg-muted text-foreground', 'aria-current': 'page' }}
          >
            {t(s.label)}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
