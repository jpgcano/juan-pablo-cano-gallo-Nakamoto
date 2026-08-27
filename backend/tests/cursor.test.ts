import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/shared/http/cursor.js';

describe('keyset cursor', () => {
  it('round trips a valid timestamp and UUID', () => {
    const cursor = { createdAt: '2026-08-27T12:00:00.000Z', id: '123e4567-e89b-12d3-a456-426614174000' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each(['not-base64', encodeCursor({ createdAt: 'not a date', id: '123e4567-e89b-12d3-a456-426614174000' })])(
    'rejects malformed cursor %s',
    (raw) => {
      expect(decodeCursor(raw)).toBeNull();
    },
  );

  it('rejects arbitrary non-UUID ids', () => {
    expect(decodeCursor(encodeCursor({ createdAt: new Date().toISOString(), id: '1' }))).toBeNull();
  });
});
