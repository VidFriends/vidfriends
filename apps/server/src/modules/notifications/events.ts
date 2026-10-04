// GET /events (FR-NOTIF-06, BR-NOT-7, ADR-0019): a member's realtime stream of invalidation hints.
import { MAX_EVENT_STREAMS, type RealtimeEvent } from '@vidfriends/contracts';
import { streamSSE } from 'hono/streaming';
import type { AppContext, Viewer } from '../../http/context.js';
import type { Deps } from '../../http/deps.js';
import { ApiError } from '../../http/errors.js';
import { sessionStillValid } from '../auth/sessions.js';

/** BR-NOT-7 timings; tests shorten them. */
export const streamTiming = { heartbeatMs: 25_000, maxMs: 30 * 60_000 };

export function eventStream(c: AppContext, deps: Deps, viewer: Viewer): Response {
  const hub = deps.realtime;
  if (!hub) throw new ApiError('unavailable', 'Realtime events are not available');
  if (hub.count(viewer.id) >= MAX_EVENT_STREAMS) {
    throw new ApiError('rate_limited', 'Too many open event streams');
  }
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (stream) => {
    let closed = false;
    let wake: () => void = () => {};
    const done = new Promise<void>((resolve) => (wake = resolve));
    const close = () => {
      closed = true;
      wake();
    };
    const queue: RealtimeEvent[] = [];
    let flushing = Promise.resolve();
    const send = (event: RealtimeEvent) => {
      queue.push(event);
      flushing = flushing.then(async () => {
        while (queue.length && !closed) {
          await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
        }
      });
    };
    const unsubscribe = hub.subscribe(viewer.id, send, close);
    stream.onAbort(close);
    const heartbeat = setInterval(() => {
      void (async () => {
        if (closed) return;
        // A revoked or expired session, or a suspended account, ends the stream (BR-NOT-7).
        if (!(await sessionStillValid(deps, viewer.sessionHash).catch(() => false))) close();
        else await stream.write(': ping\n\n');
      })();
    }, streamTiming.heartbeatMs);
    const lifetime = setTimeout(close, streamTiming.maxMs);
    try {
      await stream.writeSSE({ event: 'ready', data: '{}', retry: 5000 });
      await done;
    } finally {
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      unsubscribe();
      await flushing.catch(() => {});
    }
  });
}
