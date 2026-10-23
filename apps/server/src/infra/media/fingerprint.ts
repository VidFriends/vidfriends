// Perceptual fingerprints for media dedup (BR-MED-4, ADR-0022): a 64-bit DCT hash (pHash) of 8
// frames taken at fixed fractions of the duration. Frames too flat to say anything (black,
// a single colour) are left out, so blank or undecodable clips never match each other (L-19).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FfmpegOptions } from './ffmpeg.js';
import { run } from './run.js';

export const FRAME_COUNT = 8;
/** Frames whose pixel standard deviation is below this carry no usable structure. */
export const MIN_FRAME_STDDEV = 6;
/** At least this many frames must be usable, in both clips, for a comparison. */
export const MIN_FRAMES = 5;
/** Every common frame within this Hamming distance (of 64 bits)… */
export const MAX_FRAME_DISTANCE = 10;
/** …and on average within this. */
export const MAX_MEAN_DISTANCE = 5;

const SIZE = 32;

export interface Fingerprint {
  /** One 64-bit hash per frame position; null where the frame was unusable. */
  frames: (bigint | null)[];
}

/** DCT-II coefficients cos((2x+1)uπ/2N), computed once. */
const COS: number[][] = Array.from({ length: 8 }, (_, u) =>
  Array.from({ length: SIZE }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE))),
);

/** pHash of a 32×32 grayscale frame, or null when the frame is too flat to use. */
export function frameHash(pixels: Uint8Array): bigint | null {
  if (pixels.length !== SIZE * SIZE) return null;
  let sum = 0;
  for (const p of pixels) sum += p;
  const mean = sum / pixels.length;
  let variance = 0;
  for (const p of pixels) variance += (p - mean) ** 2;
  if (Math.sqrt(variance / pixels.length) < MIN_FRAME_STDDEV) return null;
  // Low-frequency 8×8 block of the 2-D DCT.
  const rows: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = [];
    for (let u = 0; u < 8; u++) {
      let acc = 0;
      for (let x = 0; x < SIZE; x++) acc += pixels[y * SIZE + x]! * COS[u]![x]!;
      row.push(acc);
    }
    rows.push(row);
  }
  const coeffs: number[] = [];
  for (let v = 0; v < 8; v++)
    for (let u = 0; u < 8; u++) {
      let acc = 0;
      for (let y = 0; y < SIZE; y++) acc += rows[y]![u]! * COS[v]![y]!;
      coeffs.push(acc);
    }
  // Median of the AC terms (the DC term only encodes brightness).
  const sorted = coeffs.slice(1).sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;
  let hash = 0n;
  for (let i = 0; i < 64; i++) if (coeffs[i]! > median) hash |= 1n << BigInt(i);
  return hash;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Whether two fingerprints show the same clip (ADR-0022 thresholds). */
export function sameClip(a: Fingerprint, b: Fingerprint): boolean {
  const distances: number[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const x = a.frames[i];
    const y = b.frames[i];
    if (x == null || y == null) continue;
    distances.push(hamming(x, y));
  }
  if (distances.length < MIN_FRAMES) return false;
  if (distances.some((d) => d > MAX_FRAME_DISTANCE)) return false;
  return distances.reduce((s, d) => s + d, 0) / distances.length <= MAX_MEAN_DISTANCE;
}

export function usableFrames(f: Fingerprint): number {
  return f.frames.filter((h) => h != null).length;
}

/** 8 bytes per frame position plus a validity mask, for storage. */
export function encodeFingerprint(f: Fingerprint): { hashes: Buffer; mask: number } {
  const hashes = Buffer.alloc(FRAME_COUNT * 8);
  let mask = 0;
  f.frames.forEach((h, i) => {
    if (h == null) return;
    hashes.writeBigUInt64BE(h, i * 8);
    mask |= 1 << i;
  });
  return { hashes, mask };
}

export function decodeFingerprint(hashes: Buffer, mask: number): Fingerprint {
  return {
    frames: Array.from({ length: FRAME_COUNT }, (_, i) =>
      mask & (1 << i) ? hashes.readBigUInt64BE(i * 8) : null,
    ),
  };
}

/**
 * Samples FRAME_COUNT frames at (i + 1) / (FRAME_COUNT + 1) of the duration as 32×32 grayscale.
 * Returns null when the duration is unknown or too few frames are usable.
 */
export async function fingerprint(
  file: string,
  dir: string,
  durationSeconds: number | null,
  o: FfmpegOptions,
): Promise<Fingerprint | null> {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const frames: (bigint | null)[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const at = (durationSeconds * (i + 1)) / (FRAME_COUNT + 1);
    const out = join(dir, `fp-${i}.gray`);
    const r = await run(
      o.ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-ss',
        at.toFixed(3),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        `scale=${SIZE}:${SIZE}:flags=area,format=gray`,
        '-f',
        'rawvideo',
        out,
      ],
      { timeoutMs: 60_000 },
    );
    frames.push(
      r.code === 0
        ? frameHash(new Uint8Array(await readFile(out).catch(() => Buffer.alloc(0))))
        : null,
    );
  }
  const fp = { frames };
  return usableFrames(fp) >= MIN_FRAMES ? fp : null;
}
