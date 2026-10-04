import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import { ApiError, createApiClient, readCookie } from '@vidfriends/api-client';

type ExpiredHandler = () => void;
let onExpired: ExpiredHandler = () => {};

/** Registers the single global "session expired" path (SDD §5, L-17). */
export function setSessionExpiredHandler(handler: ExpiredHandler): void {
  onExpired = handler;
}

export const api = createApiClient({
  auth: { kind: 'cookie', csrfToken: () => readCookie('vf_csrf') },
  onUnauthorized: () => onExpired(),
});

const retry = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2;

export const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  mutationCache: new MutationCache(),
  defaultOptions: {
    queries: { retry, staleTime: 15_000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
