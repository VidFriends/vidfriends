// In-memory fixed-window rate limiter (TDD §3: one API process at target scale). The interface is
// small so a PostgreSQL-backed store can replace it if replicas are added.
import type { Clock } from './clock.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): RateLimitResult;
  reset(): void;
}

export function createRateLimiter(clock: Clock): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = 0;
  return {
    hit(key, limit, windowMs) {
      const now = clock.now().getTime();
      if (now - lastSweep > 60_000) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        lastSweep = now;
      }
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      return {
        allowed: w.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
      };
    },
    reset() {
      windows.clear();
    },
  };
}
