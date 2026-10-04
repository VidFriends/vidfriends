// Hermes has no Intl.RelativeTimeFormat; relativeTime must not depend on it (it crashed the app).
import { relativeTime } from './index';

const now = Date.parse('2026-10-04T12:00:00Z');
const at = (ms: number) => new Date(now + ms).toISOString();

describe('relativeTime', () => {
  const original = Intl.RelativeTimeFormat;
  beforeAll(() => {
    // Simulate Hermes.
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = undefined;
  });
  afterAll(() => {
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = original;
  });

  it('formats past and future times without Intl.RelativeTimeFormat', () => {
    expect(relativeTime(at(-10_000), now)).toBe('just now');
    expect(relativeTime(at(-60_000), now)).toBe('1 minute ago');
    expect(relativeTime(at(-5 * 60_000), now)).toBe('5 minutes ago');
    expect(relativeTime(at(-3 * 3600e3), now)).toBe('3 hours ago');
    expect(relativeTime(at(-13 * 3600e3), now)).toBe('13 hours ago');
    expect(relativeTime(at(-86400e3), now)).toBe('1 day ago');
    expect(relativeTime(at(7 * 86400e3), now)).toBe('in 7 days');
  });
});
