// Realtime fan-out (ADR-0019, FR-NOTIF-06): writers call `publish()` inside their transaction, so
// PostgreSQL delivers the event on commit to every API process LISTENing on the channel; each
// process forwards it to that member's open event streams.
import type { RealtimeEvent } from '@vidfriends/contracts';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import type { DbOrTx } from './db.js';
import type { Logger } from './logger.js';

export const REALTIME_CHANNEL = 'vf_events';
const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** Queues an event for a member; sent only if the surrounding transaction commits. */
export async function publish(db: DbOrTx, userId: string, event: RealtimeEvent): Promise<void> {
  const payload = JSON.stringify({ u: userId, e: event });
  await db.execute(sql`select pg_notify(${REALTIME_CHANNEL}, ${payload})`);
}

export type Listener = (event: RealtimeEvent) => void;

export interface RealtimeHub {
  /** Registers a member's stream; returns the unsubscribe function. */
  subscribe(userId: string, listener: Listener, onClose: () => void): () => void;
  /** Open streams of a member in this process. */
  count(userId: string): number;
  /** Open streams in this process (metrics). */
  total(): number;
  start(): Promise<void>;
  /** Stops listening and ends every open stream (graceful shutdown). */
  stop(): Promise<void>;
}

interface Subscriber {
  listener: Listener;
  onClose: () => void;
}

export function createRealtimeHub(databaseUrl: string, log: Logger): RealtimeHub {
  const subscribers = new Map<string, Set<Subscriber>>();
  let client: pg.Client | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: NodeJS.Timeout | null = null;

  function dispatch(payload: string | undefined) {
    if (!payload) return;
    let message: { u?: unknown; e?: unknown };
    try {
      message = JSON.parse(payload) as { u?: unknown; e?: unknown };
    } catch {
      return;
    }
    if (typeof message.u !== 'string' || !message.e) return;
    for (const s of subscribers.get(message.u) ?? []) {
      try {
        s.listener(message.e as RealtimeEvent);
      } catch (err) {
        log.warn({ err }, 'realtime listener failed');
      }
    }
  }

  async function connect(): Promise<void> {
    const c = new pg.Client({ connectionString: databaseUrl });
    c.on('notification', (m) => {
      if (m.channel === REALTIME_CHANNEL) dispatch(m.payload);
    });
    c.on('error', (err) => {
      log.warn({ err: err.message }, 'realtime listener connection lost');
      void c.end().catch(() => {});
      if (client === c) client = null;
      schedule();
    });
    await c.connect();
    await c.query(`LISTEN ${REALTIME_CHANNEL}`);
    client = c;
    attempt = 0;
  }

  function schedule() {
    if (stopped || timer) return;
    const delay = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)]!;
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      connect().catch((err: Error) => {
        log.warn({ err: err.message }, 'realtime listener reconnect failed');
        schedule();
      });
    }, delay);
    timer.unref();
  }

  return {
    subscribe(userId, listener, onClose) {
      const entry: Subscriber = { listener, onClose };
      let set = subscribers.get(userId);
      if (!set) subscribers.set(userId, (set = new Set()));
      set.add(entry);
      return () => {
        set.delete(entry);
        if (!set.size) subscribers.delete(userId);
      };
    },
    count: (userId) => subscribers.get(userId)?.size ?? 0,
    total: () => [...subscribers.values()].reduce((n, s) => n + s.size, 0),
    async start() {
      await connect();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const set of subscribers.values()) for (const s of set) s.onClose();
      subscribers.clear();
      await client?.end().catch(() => {});
      client = null;
    },
  };
}
