// Progress beacons (FR-FEED-03): the server decides "watched" (≥ 10 s or ≥ 50 %); the client
// reports position at most every few seconds and when playback pauses or the item leaves view.
export const PROGRESS_INTERVAL_MS = 4000;

export interface ProgressSample {
  position_ms: number;
  duration_ms?: number;
}

/** Returns a sample to send, or null while throttled or when nothing new happened. */
export function createProgressThrottle(intervalMs = PROGRESS_INTERVAL_MS) {
  let lastSentAt = -Infinity;
  let lastPosition = -1;
  return function next(
    currentTimeSec: number,
    durationSec: number,
    now: number,
    force = false,
  ): ProgressSample | null {
    const position_ms = Math.max(0, Math.round(currentTimeSec * 1000));
    if (position_ms === lastPosition) return null;
    if (!force && now - lastSentAt < intervalMs) return null;
    lastSentAt = now;
    lastPosition = position_ms;
    const duration_ms = durationSec > 0 ? Math.round(durationSec * 1000) : undefined;
    return duration_ms ? { position_ms, duration_ms } : { position_ms };
  };
}
