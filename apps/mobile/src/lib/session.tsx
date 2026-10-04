// App session: the paired instance, the bearer token and the API client built from them.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient, type ApiClient } from '@vidfriends/api-client';
import { ApiProvider } from '@vidfriends/api-client/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as storage from './storage';

interface SessionState {
  ready: boolean;
  instance: storage.PairedInstance | null;
  signedIn: boolean;
  /** Join code from a scanned or pasted join link, consumed by the join screen. */
  pendingInvite: string | null;
}

interface SessionApi extends SessionState {
  api: ApiClient;
  pair(instance: storage.PairedInstance, inviteCode: string | null): Promise<void>;
  signIn(token: string): Promise<void>;
  /** Signs out; the server can be changed only after signing out (WF-PAIR-2). */
  signOut(options?: { forgetServer?: boolean }): Promise<void>;
  consumeInvite(): string | null;
  queryClient: QueryClient;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    ready: false,
    instance: null,
    signedIn: false,
    pendingInvite: null,
  });
  const token = useRef<string | null>(null);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
      }),
    [],
  );

  useEffect(() => {
    void (async () => {
      const [instance, saved] = await Promise.all([storage.loadInstance(), storage.loadToken()]);
      token.current = instance ? saved : null;
      setState((s) => ({ ...s, ready: true, instance, signedIn: Boolean(instance && saved) }));
    })();
  }, []);

  const signOut = useCallback(
    async (options: { forgetServer?: boolean } = {}) => {
      token.current = null;
      await storage.clearToken();
      if (options.forgetServer) await storage.clearInstance();
      queryClient.clear();
      setState((s) => ({
        ...s,
        signedIn: false,
        instance: options.forgetServer ? null : s.instance,
      }));
    },
    [queryClient],
  );

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: state.instance?.baseUrl ?? '',
        auth: { kind: 'bearer', token: () => token.current ?? undefined },
        // L-17: one global session-expired path.
        onUnauthorized: () => {
          if (token.current) void signOut();
        },
      }),
    [state.instance?.baseUrl, signOut],
  );

  const value: SessionApi = {
    ...state,
    api,
    queryClient,
    async pair(instance, inviteCode) {
      await storage.saveInstance(instance);
      setState((s) => ({ ...s, instance, pendingInvite: inviteCode }));
    },
    async signIn(newToken) {
      token.current = newToken;
      await storage.saveToken(newToken);
      queryClient.clear();
      setState((s) => ({ ...s, signedIn: true, pendingInvite: null }));
    },
    signOut,
    consumeInvite() {
      return state.pendingInvite;
    },
  };

  return (
    <SessionContext.Provider value={value}>
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiProvider>
    </SessionContext.Provider>
  );
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
