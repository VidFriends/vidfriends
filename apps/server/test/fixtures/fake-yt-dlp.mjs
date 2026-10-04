#!/usr/bin/env node
/* eslint-disable no-console, no-fallthrough -- a CLI stand-in: it prints like yt-dlp and exits per case */
// Deterministic stand-in for yt-dlp (TDD §7): behaviour is chosen by the URL's `v` parameter.
//   ok | big | long | fail | flaky | slow | unsupported      (download mode)
//   --skip-download                                        (metadata probe mode)
// Env: FAKE_YTDLP_MEDIA (file to "download"; else generated with ffmpeg), FAKE_YTDLP_LOG (argv log),
//      FAKE_YTDLP_STATE (dir for the flaky counter), FAKE_YTDLP_FLAKY_FAILURES (default 1).
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
if (process.env.FAKE_YTDLP_LOG)
  appendFileSync(process.env.FAKE_YTDLP_LOG, JSON.stringify(args) + '\n');
const dash = args.indexOf('--');
if (dash === -1 || dash !== args.length - 2) {
  console.error('ERROR: fake yt-dlp expects exactly one URL after --');
  process.exit(2);
}
const url = new URL(args[dash + 1]);
const mode = url.searchParams.get('v') ?? url.pathname.split('/').pop() ?? 'ok';
const template = args[args.indexOf('-o') + 1];
const out = (ext) => template.replace('%(ext)s', ext);
const info = (extra = {}) =>
  JSON.stringify({
    title: `Fixture ${mode}`,
    uploader_id: 'fixture_author',
    duration: 3,
    extractor_key: 'Youtube',
    ...extra,
  });

function makeMedia(target) {
  if (process.env.FAKE_YTDLP_MEDIA) return copyFileSync(process.env.FAKE_YTDLP_MEDIA, target);
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=4:size=360x640:rate=25',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-movflags',
    '+faststart',
    target,
  ]);
}

if (args.includes('--skip-download')) {
  writeFileSync(out('info.json'), info({ title: 'Probed title' }));
  if (args.includes('--write-thumbnail')) {
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x180',
      '-frames:v',
      '1',
      out('jpg'),
    ]);
  }
  process.exit(0);
}

switch (mode) {
  case 'big':
    console.log(
      '[download] File is larger than max-filesize (999999999 bytes > 10 bytes). Aborting.',
    );
    process.exit(0);
  case 'long':
    console.log(
      '[download] Fixture long does not pass filter (!is_live & duration <= 600), skipping ..',
    );
    process.exit(0);
  case 'unsupported':
    console.error(`ERROR: Unsupported URL: ${url}`);
    process.exit(1);
  case 'fail':
    console.error(`ERROR: [youtube] ${mode}: Unable to download webpage: HTTP Error 503 (${url})`);
    process.exit(1);
  case 'slow':
    setTimeout(() => process.exit(0), 600_000);
    break;
  case 'flaky': {
    const dir = process.env.FAKE_YTDLP_STATE ?? dirname(template);
    mkdirSync(dir, { recursive: true });
    const counter = join(dir, 'flaky-count');
    const n = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
    writeFileSync(counter, String(n + 1));
    if (n < Number(process.env.FAKE_YTDLP_FLAKY_FAILURES ?? 1)) {
      console.error('ERROR: [youtube] flaky: Connection reset');
      process.exit(1);
    }
  }
  // falls through
  default:
    makeMedia(out('mp4'));
    writeFileSync(out('info.json'), info());
    console.log(`[download] Destination: ${out('mp4')}`);
    process.exit(0);
}
