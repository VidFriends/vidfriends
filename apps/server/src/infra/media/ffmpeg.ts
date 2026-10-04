// ffprobe/ffmpeg normalisation (TDD §2, BR-MED-8, FR-VID-04).
import { join } from 'node:path';
import { run } from './run.js';

export interface Probe {
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  rotation: number;
}

export interface FfmpegOptions {
  ffmpeg: string;
  ffprobe: string;
  timeoutMs: number;
}

export class UnplayableMediaError extends Error {}

export async function probe(file: string, o: FfmpegOptions): Promise<Probe> {
  const r = await run(
    o.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '--', file],
    {
      timeoutMs: 60_000,
    },
  );
  if (r.code !== 0) throw new UnplayableMediaError('ffprobe failed');
  let json: {
    format?: { format_name?: string; duration?: string };
    streams?: Record<string, unknown>[];
  };
  try {
    json = JSON.parse(r.stdout);
  } catch {
    throw new UnplayableMediaError('ffprobe output unreadable');
  }
  const streams = json.streams ?? [];
  const video = streams.find(
    (s) =>
      s.codec_type === 'video' &&
      !(s.disposition as Record<string, number> | undefined)?.attached_pic,
  );
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new UnplayableMediaError('no video stream');
  const num = (v: unknown) =>
    typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : null;
  const sideData = (video.side_data_list as { rotation?: number }[] | undefined) ?? [];
  const rotation = Math.abs(sideData.find((d) => typeof d.rotation === 'number')?.rotation ?? 0);
  let width = num(video.width);
  let height = num(video.height);
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  const duration = num(json.format?.duration) ?? num(video.duration);
  return {
    container: json.format?.format_name ?? '',
    videoCodec: (video.codec_name as string) ?? null,
    audioCodec: (audio?.codec_name as string) ?? null,
    width,
    height,
    durationSeconds: duration && Number.isFinite(duration) ? duration : null,
    rotation,
  };
}

/** H.264 (+ AAC or no audio) in an MP4/MOV container can be remuxed instead of transcoded. */
export function isBrowserSafe(p: Probe): boolean {
  return (
    p.container.includes('mp4') &&
    p.videoCodec === 'h264' &&
    (p.audioCodec === null || p.audioCodec === 'aac')
  );
}

/** Produces `out` as H.264/AAC MP4 with faststart; returns whether it transcoded. */
export async function normalise(
  input: string,
  out: string,
  p: Probe,
  o: FfmpegOptions,
): Promise<boolean> {
  const transcode = !isBrowserSafe(p);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
  ];
  if (transcode) {
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      "scale='min(1080,iw)':-2",
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
    );
  } else {
    args.push('-c', 'copy');
  }
  args.push('-movflags', '+faststart', '-f', 'mp4', out);
  const r = await run(o.ffmpeg, args, { timeoutMs: o.timeoutMs });
  if (r.code !== 0) throw new UnplayableMediaError(r.timedOut ? 'ffmpeg timeout' : 'ffmpeg failed');
  return transcode;
}

/** Extracts one frame at ~10% of the duration as PNG (converted to WebP by the caller). */
export async function thumbnail(
  input: string,
  dir: string,
  durationSeconds: number | null,
  o: FfmpegOptions,
): Promise<string> {
  const out = join(dir, 'thumb.png');
  const at = Math.max(0, Math.min((durationSeconds ?? 0) * 0.1, 30));
  const r = await run(
    o.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-ss',
      at.toFixed(2),
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      "scale='min(720,iw)':-2",
      out,
    ],
    { timeoutMs: 120_000 },
  );
  if (r.code !== 0) throw new UnplayableMediaError('thumbnail failed');
  return out;
}
