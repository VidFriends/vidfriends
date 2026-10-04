import { ApiError } from '@vidfriends/api-client';
import { queryKey } from '@vidfriends/api-client/react';
import { getInstance, getMe } from '@vidfriends/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';

export const meQuery = () => ({
  queryKey: queryKey(getMe),
  queryFn: () => api.call(getMe),
  staleTime: 60_000,
});

export const instanceQuery = () => ({
  queryKey: queryKey(getInstance),
  queryFn: () => api.call(getInstance),
  staleTime: 60_000,
});

/** Resolves the current user, or null when not logged in. */
export async function currentUser(qc: QueryClient) {
  try {
    return await qc.ensureQueryData(meQuery());
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}
