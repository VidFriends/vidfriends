// Opaque keyset cursors (BR-FEED-6): base64url JSON tuples at full timestamp precision.
import { ApiError } from './errors.js';

export type CursorValue = string | number | boolean | null;

export function encodeCursor(values: CursorValue[]): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined, arity: number): CursorValue[] | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === arity &&
      parsed.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    ) {
      return parsed as CursorValue[];
    }
  } catch {
    // fall through
  }
  throw new ApiError('validation_failed', 'Invalid cursor', { fields: { cursor: 'invalid' } });
}
