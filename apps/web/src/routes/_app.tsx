import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { useApiMutation } from '@vidfriends/api-client/react';
import { logout } from '@vidfriends/contracts';
import { Home, LogOut, Settings, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { currentUser, meQuery } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await currentUser(context.queryClient);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
  },
  component: AppLayout,
});

const navLink =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const activeLink = { className: 'bg-muted text-foreground', 'aria-current': 'page' as const };

function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = Route.useRouteContext().queryClient;
  const me = useQuery(meQuery());
  const logoutMutation = useApiMutation(logout, {
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
  const user = me.data?.user;
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
          <Link to="/" className="mr-2 text-lg font-bold tracking-tight">
            {t('app.name')}
          </Link>
          <nav
            aria-label={t('nav.main')}
            className="flex flex-1 items-center gap-1 overflow-x-auto"
          >
            <Link
              to="/"
              className={navLink}
              activeProps={activeLink}
              activeOptions={{ exact: true }}
            >
              <Home className="size-4" aria-hidden />
              <span>{t('nav.home')}</span>
            </Link>
            {me.data?.settings_summary.can_invite && (
              <Link to="/invites" className={navLink} activeProps={activeLink}>
                <UserPlus className="size-4" aria-hidden />
                <span>{t('nav.invites')}</span>
              </Link>
            )}
            <Link to="/settings" className={navLink} activeProps={activeLink}>
              <Settings className="size-4" aria-hidden />
              <span>{t('nav.settings')}</span>
            </Link>
          </nav>
          {user && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {t('nav.account', { name: user.display_name || user.username })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate({ body: { all: false } })}
            disabled={logoutMutation.isPending}
          >
            <LogOut aria-hidden />
            <span>{t('nav.logout')}</span>
          </Button>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
