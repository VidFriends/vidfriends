import type { Readable } from 'node:stream';

/** Reads a stream into memory, failing once more than `maxBytes` arrive. */
export async function readLimited(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error('too large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
