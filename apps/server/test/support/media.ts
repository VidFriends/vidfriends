// Fixture media built with ffmpeg once per test run (no network, TDD §7).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const FIXTURE_DIR = fileURLToPath(new URL('../.fixtures', import.meta.url));
export const FAKE_YTDLP = fileURLToPath(new URL('../fixtures/fake-yt-dlp.mjs', import.meta.url));

export const fixture = (name: string) => join(FIXTURE_DIR, name);

const ff = (args: string[]) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export function buildFixtures(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const src = [
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=3:size=320x240:rate=25',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
  ];
  if (!existsSync(fixture('h264.mp4'))) {
    ff([
      ...src,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      fixture('h264.mp4'),
    ]);
  }
  if (!existsSync(fixture('h264-upload.mp4'))) {
    ff([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=duration=3:size=320x240:rate=25',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:duration=3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      fixture('h264-upload.mp4'),
    ]);
  }
  if (!existsSync(fixture('hevc.mov'))) {
    ff([
      ...src,
      '-c:v',
      'libx265',
      '-x265-params',
      'log-level=error',
      '-tag:v',
      'hvc1',
      '-c:a',
      'aac',
      '-shortest',
      fixture('hevc.mov'),
    ]);
  }
  if (!existsSync(fixture('long.mp4'))) {
    ff([
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=12:size=64x64:rate=5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      fixture('long.mp4'),
    ]);
  }
  if (!existsSync(fixture('corrupt.mp4'))) {
    // Passes the ftyp sniff, but is not decodable media.
    const buf = Buffer.alloc(4096, 7);
    buf.write('\u0000\u0000\u0000\u0018ftypisom', 0, 'latin1');
    writeFileSync(fixture('corrupt.mp4'), buf);
  }
}
