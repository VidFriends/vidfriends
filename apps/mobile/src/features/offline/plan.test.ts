import {
  canDownload,
  DEFAULT_CAP,
  emptyIndex,
  fileFor,
  FREE_SPACE_RESERVE,
  GB,
  goneEntries,
  parseIndex,
  usedBytes,
  type OfflineIndex,
} from './plan';

const entry = (id: string, bytes: number) => ({
  share_id: id,
  title: 't',
  person: 'Sam',
  bytes,
  downloaded_at: '2026-10-04T00:00:00.000Z',
  file: fileFor(id),
});

describe('offline downloads (FR-MOB-04)', () => {
  it('reads stored indexes defensively', () => {
    expect(parseIndex(null)).toEqual(emptyIndex());
    expect(parseIndex('not json')).toEqual(emptyIndex());
    expect(parseIndex('{"version":2,"entries":[]}')).toEqual(emptyIndex());
    const stored = { version: 1, cap_bytes: 5 * GB, entries: [entry('a-1', 10)] };
    expect(parseIndex(JSON.stringify(stored))).toEqual(stored);
    // Unknown caps fall back; entries pointing outside the offline folder are dropped.
    const odd = {
      version: 1,
      cap_bytes: 123,
      entries: [entry('b', 5), { ...entry('c', 5), file: '../secret.json' }],
    };
    const parsed = parseIndex(JSON.stringify(odd));
    expect(parsed.cap_bytes).toBe(DEFAULT_CAP);
    expect(parsed.entries.map((e) => e.share_id)).toEqual(['b']);
  });

  it('checks size, cap and free space before downloading', () => {
    const index: OfflineIndex = { version: 1, cap_bytes: 1 * GB, entries: [entry('a', 0.9 * GB)] };
    expect(usedBytes(index)).toBe(0.9 * GB);
    const lots = 100 * GB;
    expect(canDownload(index, null, lots)).toBe('not_ready');
    expect(canDownload(index, 0.05 * GB, lots)).toBe('ok');
    expect(canDownload(index, 0.2 * GB, lots)).toBe('over_cap');
    expect(canDownload(emptyIndex(), 0.2 * GB, 0.2 * GB + FREE_SPACE_RESERVE - 1)).toBe('no_space');
  });

  it('removes only copies whose share is gone', () => {
    const index: OfflineIndex = {
      ...emptyIndex(),
      entries: [entry('a', 1), entry('b', 1), entry('c', 1)],
    };
    expect(goneEntries(index, { a: 'gone', b: 'ok', c: 'unknown' }).map((e) => e.share_id)).toEqual(
      ['a'],
    );
  });

  it('derives safe file names', () => {
    expect(fileFor('0190-ab/../x')).toBe('0190-abx.mp4');
  });
});
