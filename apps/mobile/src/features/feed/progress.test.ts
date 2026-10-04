import { createProgressThrottle } from './progress';

describe('progress throttle (FR-FEED-03)', () => {
  it('sends at most once per interval, always when forced, never duplicates', () => {
    const next = createProgressThrottle(4000);
    expect(next(1, 20, 0)).toEqual({ position_ms: 1000, duration_ms: 20000 });
    expect(next(2, 20, 1000)).toBeNull();
    expect(next(5, 20, 4500)).toEqual({ position_ms: 5000, duration_ms: 20000 });
    expect(next(5, 20, 9000, true)).toBeNull();
    expect(next(6.2, 20, 5000, true)).toEqual({ position_ms: 6200, duration_ms: 20000 });
  });
  it('omits an unknown duration', () => {
    expect(createProgressThrottle()(3, 0, 0)).toEqual({ position_ms: 3000 });
  });
});
