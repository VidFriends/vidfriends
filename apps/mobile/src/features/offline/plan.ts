// Offline downloads (FR-MOB-04, BR-OFF-1..4): the rules, kept free of native modules so they are
// unit-tested.

export interface OfflineEntry {
  share_id: string;
  title: string;
  /** Who sent it (or to whom, for a sender's copy), shown while offline. */
  person: string;
  bytes: number;
  downloaded_at: string;
  /** File name inside the app's private offline directory. */
  file: string;
}

export interface OfflineIndex {
  version: 1;
  cap_bytes: number;
  entries: OfflineEntry[];
}

export const GB = 1024 ** 3;
/** BR-OFF-2: the member's choices for the storage cap. */
export const CAP_CHOICES = [1 * GB, 2 * GB, 5 * GB] as const;
export const DEFAULT_CAP = 2 * GB;
/** Keep this much of the device free after a download. */
export const FREE_SPACE_RESERVE = 500 * 1024 ** 2;

export const emptyIndex = (): OfflineIndex => ({ version: 1, cap_bytes: DEFAULT_CAP, entries: [] });

/** Reads a stored index defensively; anything unexpected starts empty. */
export function parseIndex(raw: string | null): OfflineIndex {
  if (!raw) return emptyIndex();
  try {
    const v = JSON.parse(raw) as Partial<OfflineIndex>;
    if (v.version !== 1 || !Array.isArray(v.entries)) return emptyIndex();
    const cap = CAP_CHOICES.includes(v.cap_bytes as (typeof CAP_CHOICES)[number])
      ? (v.cap_bytes as number)
      : DEFAULT_CAP;
    const entries = v.entries.filter(
      (e): e is OfflineEntry =>
        Boolean(e) &&
        typeof e.share_id === 'string' &&
        typeof e.file === 'string' &&
        /^[A-Za-z0-9-]+\.mp4$/.test(e.file) &&
        typeof e.bytes === 'number',
    );
    return { version: 1, cap_bytes: cap, entries };
  } catch {
    return emptyIndex();
  }
}

export const usedBytes = (index: OfflineIndex) =>
  index.entries.reduce((n, e) => n + Math.max(0, e.bytes), 0);

export type DownloadCheck = 'ok' | 'not_ready' | 'over_cap' | 'no_space';

/** BR-OFF-1/2: only ready videos with a known size, within the cap and the device's free space. */
export function canDownload(
  index: OfflineIndex,
  bytes: number | null,
  freeBytes: number,
): DownloadCheck {
  if (!bytes || bytes <= 0) return 'not_ready';
  if (usedBytes(index) + bytes > index.cap_bytes) return 'over_cap';
  if (freeBytes - bytes < FREE_SPACE_RESERVE) return 'no_space';
  return 'ok';
}

/** BR-OFF-3: copies whose share is gone for this member (404) are removed; errors keep them. */
export function goneEntries(
  index: OfflineIndex,
  status: Record<string, 'ok' | 'gone' | 'unknown'>,
): OfflineEntry[] {
  return index.entries.filter((e) => status[e.share_id] === 'gone');
}

/** A stable, safe file name for a share's copy. */
export const fileFor = (shareId: string) => `${shareId.replace(/[^A-Za-z0-9-]/g, '')}.mp4`;
