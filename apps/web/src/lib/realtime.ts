// FR-NOTIF-06 (ADR-0019): one EventSource per signed-in tab; each event makes the queries it names
// stale. Polling stays as the fallback (FR-NOTIF-05), so a failed stream only costs latency.
import { useQueryClient } from '@tanstack/react-query';
import { API_PREFIX } from '@vidfriends/contracts';
import { parseRealtimeEvent, routesFor } from '@vidfriends/api-client/realtime';
import { useEffect } from 'react';

const RETRY_MS = 30_000;

export function useRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const invalidate = (ids: string[]) => {
      for (const id of ids) void queryClient.invalidateQueries({ queryKey: [id] });
    };
    const open = () => {
      source = new EventSource(`${API_PREFIX}/events`, { withCredentials: true });
      // Anything missed while disconnected: refresh the badge and inbox once connected.
      source.addEventListener('ready', () => invalidate(routesFor({ type: 'notifications_read' })));
      source.onmessage = (m: MessageEvent<string>) => {
        const event = parseRealtimeEvent(m.data);
        if (event) invalidate(routesFor(event));
      };
      source.onerror = () => {
        // The browser retries a dropped stream itself; a refused one (401, 429) stays closed.
        if (source?.readyState === EventSource.CLOSED && !stopped && !retry) {
          retry = setTimeout(() => {
            retry = null;
            if (!stopped) open();
          }, RETRY_MS);
        }
      };
    };
    open();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [queryClient]);
}
