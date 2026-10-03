/**
 * Blast module pure helpers — mapper `toBlastRadius`, `blastCounts`,
 * `prNumbersFromMessage`, `notesFromBody`.
 * Oracles: plan "Test brief" WP4.tests + the mapper rules in the plan's Contract
 * (group/caller order, declaration-file exclusion, summary string).
 */
import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import {
  blastCounts,
  notesFromBody,
  prNumbersFromMessage,
  toBlastRadius,
} from '../src/modules/blast/helpers.js';
import type { BlastCallerRow, BlastResult } from '../src/modules/repo-intel/types.js';

function caller(over: Partial<BlastCallerRow> & Pick<BlastCallerRow, 'file' | 'viaSymbol'>): BlastCallerRow {
  return { symbol: 'fn', line: 1, rank: 1, depth: 1, through: null, ...over };
}

function fixture(): BlastResult {
  return {
    changedSymbols: [
      { name: 'A', file: 'src/a.ts', kind: 'function' },
      { name: 'B', file: 'src/b.ts', kind: 'function' },
      { name: 'C', file: 'src/c.ts', kind: 'function' },
    ],
    callers: [
      caller({ file: 'src/x.ts', viaSymbol: 'A', rank: 5, symbol: 'xFn' }),
      caller({ file: 'src/y.ts', viaSymbol: 'A', rank: 9, symbol: 'yFn' }),
      // The declaration file of A: not a downstream impact.
      caller({ file: 'src/a.ts', viaSymbol: 'A', rank: 99, symbol: 'selfFn' }),
      caller({ file: 'src/z.ts', viaSymbol: 'A', rank: 1, depth: 2, through: 'xFn', symbol: 'zFn' }),
      caller({ file: 'src/w.ts', viaSymbol: 'B', rank: 9, symbol: 'wFn' }),
    ],
    impactedEndpoints: ['GET /a', 'POST /b'],
    factsByFile: {
      'src/y.ts': { endpoints: ['GET /a'], crons: ['nightly'] },
      'src/z.ts': { endpoints: ['GET /a', 'POST /b'], crons: [] },
    },
    indexedSha: 'deadbeef',
    degraded: false,
    source: 'index',
  };
}

describe('toBlastRadius', () => {
  it('orders groups by max rank, then caller count; orders callers depth/rank; drops the declaration file', () => {
    const out = toBlastRadius(fixture());

    // A and B tie on max rank (9); A has 3 callers (a.ts excluded) vs 1.
    expect(out.downstream.map((d) => d.symbol)).toEqual(['A', 'B']);
    const a = out.downstream[0]!;
    expect(a.callers.map((c) => c.file)).toEqual(['src/y.ts', 'src/x.ts', 'src/z.ts']);
    expect(a.callers.map((c) => c.file)).not.toContain('src/a.ts');
    expect(a.callers[2]).toMatchObject({ depth: 2, through: 'xFn', name: 'zFn', line: 1 });
    expect(a.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(a.crons_affected).toEqual(['nightly']);
    expect(out.downstream[1]!.endpoints_affected).toEqual([]);
  });

  it('puts the group with the highest-ranked caller first even when another group has more callers', () => {
    const out = toBlastRadius({
      changedSymbols: [
        { name: 'Many', file: 'src/m.ts', kind: 'function' },
        { name: 'Top', file: 'src/t.ts', kind: 'function' },
      ],
      callers: [
        caller({ file: 'src/p.ts', viaSymbol: 'Many', rank: 5 }),
        caller({ file: 'src/q.ts', viaSymbol: 'Many', rank: 4 }),
        caller({ file: 'src/r.ts', viaSymbol: 'Top', rank: 9 }),
      ],
      impactedEndpoints: [],
      source: 'index',
    });
    expect(out.downstream.map((d) => d.symbol)).toEqual(['Top', 'Many']);
  });

  it('lists a depth-1 caller before a depth-2 caller of higher rank', () => {
    const out = toBlastRadius({
      changedSymbols: [{ name: 'A', file: 'src/a.ts', kind: 'function' }],
      callers: [
        caller({ file: 'src/deep.ts', viaSymbol: 'A', rank: 50, depth: 2, through: 'h' }),
        caller({ file: 'src/near.ts', viaSymbol: 'A', rank: 2, depth: 1 }),
      ],
      impactedEndpoints: [],
      source: 'index',
    });
    expect(out.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/near.ts', 'src/deep.ts']);
  });

  it('keeps a symbol without callers only in changed_symbols', () => {
    const out = toBlastRadius(fixture());
    expect(out.changed_symbols.map((s) => s.name)).toEqual(['A', 'B', 'C']);
    expect(out.changed_symbols[0]).toEqual({ name: 'A', file: 'src/a.ts', kind: 'function' });
    expect(out.downstream.map((d) => d.symbol)).not.toContain('C');
  });

  it('builds the exact summary string', () => {
    expect(toBlastRadius(fixture()).summary).toBe(
      '3 symbol(s) → 4 caller(s) · 2 endpoint(s) · 1 cron(s)',
    );
  });

  it('depth-1 callers carry depth 1 and no `through` key', () => {
    const out = toBlastRadius(fixture());
    const first = out.downstream[0]!.callers[0]!;
    expect(first.depth).toBe(1);
    expect('through' in first).toBe(false);
  });

  it('passes indexed_sha / degraded / reason through; an empty indexedSha leaves the key out', () => {
    const withSha = toBlastRadius(fixture());
    expect(withSha.indexed_sha).toBe('deadbeef');
    expect(withSha.degraded).toBe(false);
    expect('reason' in withSha).toBe(false);

    const partial = toBlastRadius({ ...fixture(), indexedSha: '', degraded: true, reason: 'index_partial' });
    expect('indexed_sha' in partial).toBe(false);
    expect(partial.degraded).toBe(true);
    expect(partial.reason).toBe('index_partial');

    const missing = toBlastRadius({ ...fixture(), indexedSha: undefined });
    expect('indexed_sha' in missing).toBe(false);
  });

  it('breaks rank ties by file asc then line asc inside a group', () => {
    const out = toBlastRadius({
      changedSymbols: [{ name: 'A', file: 'src/a.ts', kind: 'function' }],
      callers: [
        caller({ file: 'src/m.ts', viaSymbol: 'A', rank: 4, line: 9 }),
        caller({ file: 'src/b.ts', viaSymbol: 'A', rank: 4, line: 20 }),
        caller({ file: 'src/b.ts', viaSymbol: 'A', rank: 4, line: 3 }),
      ],
      impactedEndpoints: [],
      source: 'index',
    });
    expect(out.downstream[0]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'src/b.ts:3',
      'src/b.ts:20',
      'src/m.ts:9',
    ]);
  });

  it('breaks group ties by symbol asc when rank and caller count are equal', () => {
    const out = toBlastRadius({
      changedSymbols: [
        { name: 'Zed', file: 'src/z.ts', kind: 'function' },
        { name: 'Alpha', file: 'src/al.ts', kind: 'function' },
      ],
      callers: [
        caller({ file: 'src/p.ts', viaSymbol: 'Zed', rank: 3 }),
        caller({ file: 'src/q.ts', viaSymbol: 'Alpha', rank: 3 }),
      ],
      impactedEndpoints: [],
      source: 'index',
    });
    expect(out.downstream.map((d) => d.symbol)).toEqual(['Alpha', 'Zed']);
  });

  it('degraded empty result maps to a valid, empty BlastRadius', () => {
    const out = toBlastRadius({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'flag_off',
      source: 'none',
    });
    expect(out).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      reason: 'flag_off',
      summary: '0 symbol(s) → 0 caller(s) · 0 endpoint(s) · 0 cron(s)',
    });
    expect(() => BlastRadius.parse(out)).not.toThrow();
  });

  it('result satisfies the wire contract', () => {
    expect(() => BlastRadius.parse(toBlastRadius(fixture()))).not.toThrow();
  });
});

describe('blastCounts', () => {
  it('counts unique endpoints / crons across groups and sums callers', () => {
    const radius = BlastRadius.parse({
      changed_symbols: [
        { name: 'A', file: 'a.ts', kind: 'function' },
        { name: 'B', file: 'b.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'A',
          callers: [
            { name: 'x', file: 'x.ts', line: 1 },
            { name: 'y', file: 'y.ts', line: 2 },
          ],
          endpoints_affected: ['GET /a', 'GET /b'],
          crons_affected: ['nightly'],
        },
        {
          symbol: 'B',
          callers: [{ name: 'w', file: 'w.ts', line: 3 }],
          endpoints_affected: ['GET /a'],
          crons_affected: ['nightly', 'hourly'],
        },
      ],
      summary: 's',
    });
    expect(blastCounts(radius)).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 2 });
  });
});

describe('prNumbersFromMessage', () => {
  it('reads a squash suffix', () => {
    expect(prNumbersFromMessage('Add limiter (#482)')).toEqual([482]);
  });
  it('reads a merge commit from the first line only', () => {
    expect(prNumbersFromMessage('Merge pull request #12 from acme/feat\n\nbody (#99)')).toEqual([12]);
  });
  it('ignores a bare #N in prose', () => {
    expect(prNumbersFromMessage('Fix #12 crash')).toEqual([]);
  });
  it('takes the trailing reference of a revert, not the quoted one', () => {
    expect(prNumbersFromMessage('Revert "Add x (#5)" (#9)')).toEqual([9]);
  });
  it('ignores a (#N) that is only in the body', () => {
    expect(prNumbersFromMessage('Plain subject\n\nsee (#77)')).toEqual([]);
  });
});

describe('notesFromBody', () => {
  it('keeps code-shaped punctuation (sk_live_, #482, a_b > c) and skips comments/headings/bullets markers', () => {
    expect(
      notesFromBody('<!-- tpl -->\n## Summary\n\n- Uses `sk_live_` key, see #482 and a_b > c'),
    ).toBe('Uses sk_live_ key, see #482 and a_b > c');
  });

  it('returns an empty string for null and for a body with no prose', () => {
    expect(notesFromBody(null)).toBe('');
    expect(notesFromBody('## Only a heading\n\n---\n')).toBe('');
  });

  it('does not treat "#482 is not a title" as a heading', () => {
    expect(notesFromBody('#482 is not a title')).toBe('#482 is not a title');
  });

  it('strips a quote marker, an ordered-list marker and bold', () => {
    expect(notesFromBody('> **Fixes** the cache')).toBe('Fixes the cache');
    expect(notesFromBody('1. First step')).toBe('First step');
  });

  it('truncates a 300-char line to 200 characters ending with an ellipsis', () => {
    const out = notesFromBody('x'.repeat(300));
    expect(out).toHaveLength(200);
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, 199)).toBe('x'.repeat(199));
  });

  it('does not truncate a line of exactly 200 characters', () => {
    expect(notesFromBody('y'.repeat(200))).toBe('y'.repeat(200));
  });
});
