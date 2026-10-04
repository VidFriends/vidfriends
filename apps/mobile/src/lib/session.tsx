// App session: the paired instance, the bearer token and the API client built from them.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient, type ApiClient } from '@vidfriends/api-client';
import { ApiProvider } from '@vidfriends/api-client/react';
import { exchangeMobileCode } from '@vidfriends/contracts';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
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
import {
  CALLBACK_URL,
  challengeFromDigest,
  handoffUrl,
  parseCallback,
  randomToken,
  type HandoffRequest,
} from './handoff';
import * as storage from './storage';

/**
 * E2E builds only (set at bundle time, never in releases): a fixed PKCE verifier for the `state`
 * `e2e`, so Maestro can hand the app a code minted by the seed script, because an emulator
 * browser cannot run a passkey ceremony. Release bundles have no value here.
 */
const E2E_VERIFIER = process.env.EXPO_PUBLIC_E2E_HANDOFF_VERIFIER;
export const E2E_STATE = 'e2e';

export type HandoffOutcome = 'signed_in' | 'cancelled';

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
  /** WF-AUTH-5: sign in or join with a passkey in the browser, then return to the app. */
  startHandoff(mode: HandoffRequest['mode'], invite?: string | null): Promise<HandoffOutcome>;
  /** Finishes a hand-off from its `vidfriends://auth` callback (once per code). */
  completeHandoff(url: string): Promise<void>;
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
  const pending = useRef<{ state: string; verifier: string } | null>(null);
  const exchanges = useRef(new Map<string, Promise<void>>());
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

  const signIn = async (newToken: string) => {
    token.current = newToken;
    await storage.saveToken(newToken);
    queryClient.clear();
    setState((s) => ({ ...s, signedIn: true, pendingInvite: null }));
  };

  const completeHandoff = (url: string): Promise<void> => {
    const query = new URLSearchParams(url.split('?')[1] ?? '');
    // The browser result and the deep link can both deliver the same callback.
    const running = exchanges.current.get(query.get('code') ?? '');
    if (running) return running;
    const state = query.get('state') ?? '';
    const verifier =
      pending.current?.state === state
        ? pending.current.verifier
        : E2E_VERIFIER && state === E2E_STATE
          ? E2E_VERIFIER
          : null;
    const code = verifier ? parseCallback(url, state) : null;
    if (!verifier || !code) return Promise.reject(new Error('handoff_invalid'));
    pending.current = null;
    const run = (async () => {
      const res = await api.call(exchangeMobileCode, {
        body: { code, code_verifier: verifier },
      });
      await signIn(res.token);
    })();
    exchanges.current.set(code, run);
    return run;
  };

  const value: SessionApi = {
    ...state,
    api,
    queryClient,
    async pair(instance, inviteCode) {
      await storage.saveInstance(instance);
      setState((s) => ({ ...s, instance, pendingInvite: inviteCode }));
    },
    signIn,
    async startHandoff(mode, invite) {
      if (!state.instance) throw new Error('not paired');
      const verifier = randomToken(Crypto.getRandomBytes(32));
      const handoffState = randomToken(Crypto.getRandomBytes(16));
      const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      pending.current = { state: handoffState, verifier };
      const result = await WebBrowser.openAuthSessionAsync(
        handoffUrl(state.instance.baseUrl, {
          mode,
          state: handoffState,
          codeChallenge: challengeFromDigest(digest),
          invite,
        }),
        CALLBACK_URL,
      );
      if (result.type !== 'success') return 'cancelled';
      await completeHandoff(result.url);
      return 'signed_in';
    },
    completeHandoff,
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
