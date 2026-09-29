/**
 * WP6.tests — pure formatting helpers (Contract § Common output).
 */
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, loc, sortFindings } from '../src/format.js';

describe('loc', () => {
  it('renders "file:start" when start === end', () => {
    expect(loc('a.ts', 12, 12)).toBe('a.ts:12');
  });

  it('renders "file:start-end" when start !== end', () => {
    expect(loc('a.ts', 12, 18)).toBe('a.ts:12-18');
  });
});

describe('sortFindings', () => {
  it('orders CRITICAL > WARNING > SUGGESTION (unknown last), then file, then start_line', () => {
    const input = [
      { severity: 'SUGGESTION', file: 'b.ts', start_line: 1 },
      { severity: 'CRITICAL', file: 'c.ts', start_line: 5 },
      { severity: 'WARNING', file: 'a.ts', start_line: 9 },
      { severity: 'CRITICAL', file: 'a.ts', start_line: 3 },
    ];

    expect(sortFindings(input)).toEqual([
      { severity: 'CRITICAL', file: 'a.ts', start_line: 3 },
      { severity: 'CRITICAL', file: 'c.ts', start_line: 5 },
      { severity: 'WARNING', file: 'a.ts', start_line: 9 },
      { severity: 'SUGGESTION', file: 'b.ts', start_line: 1 },
    ]);
  });
});

describe('cursor encode/decode', () => {
  it('round-trips an offset', () => {
    expect(decodeCursor(encodeCursor(20))).toBe(20);
  });

  it('throws E18 for a cursor that does not decode to a non-negative integer', () => {
    expect(() => decodeCursor('%%%')).toThrow('Invalid cursor "%%%". Omit cursor to start from the first page.');
  });
});
