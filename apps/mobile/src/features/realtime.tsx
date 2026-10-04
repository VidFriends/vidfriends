// FR-NOTIF-06 (ADR-0019): while the app is in the foreground and signed in, it keeps the realtime
// stream open and makes the queries each event names stale. Polling stays as the fallback
// (FR-NOTIF-05). React Native's fetch cannot stream, so this uses `expo/fetch`.
import { parseRealtimeEvent, routesFor, SseParser } from '@vidfriends/api-client/realtime';
import { API_PREFIX } from '@vidfriends/contracts';
import { fetch } from 'expo/fetch';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/lib/session';

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** Event payloads are ASCII JSON; TextDecoder is used when the engine has it. */
function decoder(): (bytes: Uint8Array) => string {
  if (typeof TextDecoder !== 'undefined') {
    const d = new TextDecoder();
    return (bytes) => d.decode(bytes, { stream: true });
  }
  return (bytes) => String.fromCharCode(...bytes);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export function RealtimeUpdates() {
  const session = useSession();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const baseUrl = session.instance?.baseUrl;
  const { signedIn, queryClient } = session;
  useEffect(() => {
    if (!signedIn || !foreground || !baseUrl) return;
    const controller = new AbortController();
    const { signal } = controller;
    const invalidate = (ids: string[]) => {
      for (const id of ids) void queryClient.invalidateQueries({ queryKey: [id] });
    };
    void (async () => {
      let attempt = 0;
      while (!signal.aborted) {
        const token = session.bearerToken();
        if (!token) return;
        try {
          const res = await fetch(`${baseUrl}${API_PREFIX}/events`, {
            headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
            signal,
          });
          // A rejected session is handled by the API client's 401 path; stop here.
          if (res.status === 401) return;
          if (res.ok && res.body) {
            const reader = res.body.getReader();
            const decode = decoder();
            const parser = new SseParser();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              for (const m of parser.push(decode(value))) {
                attempt = 0;
                // On (re)connect, refresh what may have changed while disconnected.
                if (m.event === 'ready') invalidate(routesFor({ type: 'notifications_read' }));
                else {
                  const event = parseRealtimeEvent(m.data);
                  if (event) invalidate(routesFor(event));
                }
              }
            }
          }
        } catch {
          if (signal.aborted) return;
        }
        await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!, signal);
        attempt += 1;
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, foreground, baseUrl, queryClient]);
  return null;
}
