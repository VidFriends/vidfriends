// Image re-encoding (NFR-SEC-08): decode untrusted bytes with sharp, emit a fresh WebP.
import sharp from 'sharp';

sharp.cache(false);

export class NotAnImageError extends Error {}

export async function toSquareWebp(input: Buffer, size: number): Promise<Buffer> {
  try {
    return await sharp(input, { limitInputPixels: 40_000_000, failOn: 'error', animated: false })
      .rotate()
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new NotAnImageError('not an image');
  }
}

export async function toWebpWidth(input: Buffer, width: number): Promise<Buffer> {
  try {
    return await sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new NotAnImageError('not an image');
  }
}
