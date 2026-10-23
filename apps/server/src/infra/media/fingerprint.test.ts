// ADR-0022: perceptual hash maths (no ffmpeg needed).
import { describe, expect, it } from 'vitest';
import {
  decodeFingerprint,
  encodeFingerprint,
  frameHash,
  hamming,
  sameClip,
  type Fingerprint,
} from './fingerprint.js';

/** A 32×32 frame drawn by `f(x, y)` (0..255). */
const frame = (f: (x: number, y: number) => number) => {
  const px = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) px[y * 32 + x] = Math.max(0, Math.min(255, Math.round(f(x, y))));
  return px;
};
const gradient = frame((x, y) => x * 6 + y * 2);
const checker = frame((x, y) => (((x >> 2) + (y >> 2)) % 2 ? 220 : 30));
const rings = frame((x, y) => 128 + 100 * Math.sin(Math.hypot(x - 16, y - 16) / 2));

describe('frameHash', () => {
  it('ignores flat frames (black, one colour), so blank clips never match (L-19)', () => {
    expect(frameHash(frame(() => 0))).toBeNull();
    expect(frameHash(frame(() => 128))).toBeNull();
    expect(frameHash(new Uint8Array(10))).toBeNull();
  });

  it('is stable under brightness changes and small noise, and differs between images', () => {
    const ring = (x: number, y: number) => 128 + 100 * Math.sin(Math.hypot(x - 16, y - 16) / 2);
    const base = frameHash(rings)!;
    const brighter = frameHash(frame((x, y) => ring(x, y) + 15))!;
    const noisy = frameHash(frame((x, y) => ring(x, y) + ((x * 7 + y * 13) % 5) - 2))!;
    expect(hamming(base, brighter)).toBeLessThanOrEqual(4);
    expect(hamming(base, noisy)).toBeLessThanOrEqual(6);
    expect(hamming(base, frameHash(checker)!)).toBeGreaterThan(16);
    expect(hamming(frameHash(rings)!, frameHash(checker)!)).toBeGreaterThan(16);
  });
});

describe('sameClip', () => {
  const clip = (...frames: (Uint8Array | null)[]): Fingerprint => ({
    frames: frames.map((f) => (f ? frameHash(f) : null)),
  });
  const a = clip(gradient, checker, rings, gradient, checker, rings, gradient, checker);

  it('matches the same frames and survives the storage round trip', () => {
    const { hashes, mask } = encodeFingerprint(a);
    expect(sameClip(a, decodeFingerprint(hashes, mask))).toBe(true);
  });

  it('rejects a clip where any common frame differs', () => {
    const b = clip(gradient, checker, rings, gradient, checker, rings, gradient, rings);
    expect(sameClip(a, b)).toBe(false);
  });

  it('needs at least five usable frames in common', () => {
    const sparse = clip(gradient, checker, rings, gradient, null, null, null, null);
    expect(sameClip(a, sparse)).toBe(false);
    const enough = clip(gradient, checker, rings, gradient, checker, null, null, null);
    expect(sameClip(a, enough)).toBe(true);
  });
});
