// yt-dlp runner (TDD §2, ADR-0009). The URL is always passed after `--`, never as an option.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './run.js';

/** Prefers directly playable H.264/AAC ≤ 1080p so most fetches need no transcode (TDD §2). */
export const FORMAT_SELECTOR =
  'bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b';

export interface FetchedMedia {
  file: string;
  bytes: number;
  title: string;
  authorHandle: string | null;
  durationSeconds: number | null;
}

export type FetchOutcome =
  | { kind: 'downloaded'; media: FetchedMedia }
  | { kind: 'too_large' }
  | { kind: 'too_long' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string; timedOut: boolean };

export interface YtDlpOptions {
  binary: string;
  timeoutMs: number;
  maxBytes: number;
  maxDurationSeconds: number;
  /** Optional egress proxy for every yt-dlp request, redirects included (TDD §5). */
  proxy?: string | undefined;
}

const proxyArgs = (proxy: string | undefined) => (proxy ? ['--proxy', proxy] : []);

const COMMON = [
  '--no-playlist',
  '--no-progress',
  '--no-warnings',
  '--restrict-filenames',
  '--no-mtime',
  '--no-cache-dir',
  '--socket-timeout',
  '30',
  '--retries',
  '2',
];

function info(json: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    title: (str(json.title) ?? '').slice(0, 200),
    authorHandle:
      (str(json.uploader_id) ?? str(json.uploader) ?? str(json.channel))?.slice(0, 100) ?? null,
    durationSeconds: typeof json.duration === 'number' ? json.duration : null,
  };
}

/** Downloads one video into `dir`. Never throws for expected outcomes. */
export async function download(url: string, dir: string, o: YtDlpOptions): Promise<FetchOutcome> {
  const args = [
    ...COMMON,
    ...proxyArgs(o.proxy),
    '-f',
    FORMAT_SELECTOR,
    '--merge-output-format',
    'mp4',
    '--max-filesize',
    String(o.maxBytes),
    '--match-filter',
    `!is_live & duration <= ${o.maxDurationSeconds}`,
    '--write-info-json',
    '-o',
    join(dir, 'media.%(ext)s'),
    '--',
    url,
  ];
  const r = await run(o.binary, args, { timeoutMs: o.timeoutMs, cwd: dir });
  const output = `${r.stdout}\n${r.stderr}`;
  if (r.timedOut) return { kind: 'error', message: 'timeout', timedOut: true };
  if (/larger than max-filesize/i.test(output)) return { kind: 'too_large' };
  if (/does not pass filter|is_live/i.test(output) && !/ERROR/.test(output))
    return { kind: 'too_long' };
  if (/Unsupported URL/i.test(output)) return { kind: 'unsupported', message: 'unsupported' };
  const files = await readdir(dir);
  const mediaFile = files.find(
    (f) =>
      f.startsWith('media.') && !f.endsWith('.json') && !f.endsWith('.part') && !f.includes('.f'),
  );
  if (r.code !== 0 || !mediaFile) {
    return { kind: 'error', message: firstErrorLine(output) ?? `exit ${r.code}`, timedOut: false };
  }
  const file = join(dir, mediaFile);
  const bytes = (await stat(file)).size;
  if (bytes > o.maxBytes) return { kind: 'too_large' };
  let meta = {
    title: '',
    authorHandle: null as string | null,
    durationSeconds: null as number | null,
  };
  const infoFile = files.find((f) => f.endsWith('.info.json'));
  if (infoFile) {
    try {
      meta = info(
        JSON.parse(await readFile(join(dir, infoFile), 'utf8')) as Record<string, unknown>,
      );
    } catch {
      // metadata is best-effort
    }
  }
  return { kind: 'downloaded', media: { file, bytes, ...meta } };
}

/** Metadata-only probe for link-only videos (title, author, thumbnail file). Best effort. */
export async function probeMetadata(
  url: string,
  dir: string,
  o: Pick<YtDlpOptions, 'binary' | 'timeoutMs' | 'proxy'>,
): Promise<{
  title: string;
  authorHandle: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
} | null> {
  const args = [
    ...COMMON,
    ...proxyArgs(o.proxy),
    '--skip-download',
    '--write-thumbnail',
    '--convert-thumbnails',
    'jpg',
    '--write-info-json',
    '-o',
    join(dir, 'meta.%(ext)s'),
    '--',
    url,
  ];
  try {
    const r = await run(o.binary, args, { timeoutMs: o.timeoutMs, cwd: dir });
    if (r.timedOut) return null;
    const files = await readdir(dir);
    const infoFile = files.find((f) => f.endsWith('.info.json'));
    if (!infoFile) return null;
    const meta = info(
      JSON.parse(await readFile(join(dir, infoFile), 'utf8')) as Record<string, unknown>,
    );
    const thumb = files.find((f) => f.startsWith('meta.') && /\.(jpg|jpeg|png|webp)$/i.test(f));
    return { ...meta, thumbnail: thumb ? join(dir, thumb) : null };
  } catch {
    return null;
  }
}

function firstErrorLine(output: string): string | null {
  const line = output.split('\n').find((l) => l.startsWith('ERROR'));
  // Strip anything URL-like: failure reasons are stored and shown, never echo user input.
  return line ? line.replace(/https?:\/\/\S+/g, '<url>').slice(0, 200) : null;
}
