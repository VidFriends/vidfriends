// TanStack Query bindings for contract routes (SDD §5).
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { BodyOf, ParamsOf, QueryOf, ResponseOf, RouteDef } from '@vidfriends/contracts';
import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient, ApiError, RequestOptions } from './index.js';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>');
  return client;
}

/** Stable query key: [route id, params, query]. Invalidate with `[route.id]`. */
export function queryKey<R extends RouteDef>(route: R, options: RequestOptions<R> = {}): QueryKey {
  return [route.id, options.params ?? null, options.query ?? null];
}

export function useApiQuery<R extends RouteDef>(
  route: R,
  options: RequestOptions<R> = {},
  queryOptions: Omit<UseQueryOptions<ResponseOf<R>, ApiError>, 'queryKey' | 'queryFn'> = {},
) {
  const api = useApi();
  return useQuery<ResponseOf<R>, ApiError>({
    queryKey: queryKey(route, options),
    queryFn: ({ signal }) => api.call(route, { ...options, signal }),
    ...queryOptions,
  });
}

type Paged = { items: unknown[]; next_cursor: string | null };

export function useApiInfiniteQuery<R extends RouteDef>(
  route: R,
  options: { params?: ParamsOf<R>; query?: Omit<NonNullable<QueryOf<R>>, 'cursor'> } = {},
  extra: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const api = useApi();
  return useInfiniteQuery<ResponseOf<R> & Paged, ApiError>({
    queryKey: [route.id, options.params ?? null, options.query ?? null, 'infinite'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.call(route, {
        params: options.params,
        query: {
          ...(options.query ?? {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        } as QueryOf<R>,
        signal,
      } as RequestOptions<R>) as Promise<ResponseOf<R> & Paged>,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    ...extra,
  });
}

export interface MutationVars<R extends RouteDef> {
  params?: ParamsOf<R>;
  query?: QueryOf<R>;
  body?: BodyOf<R>;
}

export function useApiMutation<R extends RouteDef, Ctx = unknown>(
  route: R,
  options: Omit<
    UseMutationOptions<ResponseOf<R>, ApiError, MutationVars<R>, Ctx>,
    'mutationFn'
  > = {},
) {
  const api = useApi();
  return useMutation<ResponseOf<R>, ApiError, MutationVars<R>, Ctx>({
    mutationFn: (vars) => api.call(route, vars as RequestOptions<R>),
    ...options,
  });
}
