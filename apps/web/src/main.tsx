import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { ApiProvider } from '@vidfriends/api-client/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './styles.css';
import { api, queryClient, setSessionExpiredHandler } from './lib/api';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { routeTree } from './routeTree.gen';

applyTheme();
watchSystemTheme();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const PUBLIC_PATHS = ['/login', '/setup', '/join/', '/reset/'];

// One global session-expired path (L-17): clear cached data and go to login.
setSessionExpiredHandler(() => {
  const path = router.state.location.pathname;
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return;
  queryClient.clear();
  void router.navigate({
    to: '/login',
    search: { redirect: router.state.location.href, expired: true },
  });
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApiProvider>
  </StrictMode>,
);
