import { describe, it, expect } from 'vitest';
import {
  newSideRanges,
  groundFocus,
  groundRisks,
  clampAnswer,
  parseStoredBrief,
  toBriefResponse,
} from '../src/modules/brief/helpers.js';

/**
 * Risk Brief pure helpers: hunk ranges, grounding, clamping and the stored
 * shape. Oracles are the spec (A-7, A-8, A-9, A-30, A-31) and the plan's Test
 * brief WP3.tests [T2]; nothing here is computed by the code under test.
 */

// New side: lines 10..13 (ctx10, add11, ctx12, ctx13).
const PATCH = '@@ -10,3 +10,4 @@\n ctx10\n+add11\n ctx12\n ctx13';

const risk = (over: Partial<Parameters<typeof groundRisks>[0][number]> = {}) => ({
  kind: 'security',
  title: 'T',
  explanation: 'E',
  severity: 'high' as const,
  file_refs: [] as string[],
  ...over,
});

describe('newSideRanges (A-30)', () => {
  it('a hunk +c,d covers c..c+d-1', () => {
    expect(newSideRanges(PATCH)).toEqual([[10, 13]]);
  });

  it('an omitted d is 1; d = 0 is an empty range', () => {
    expect(newSideRanges('@@ -5,2 +7 @@\n+x')).toEqual([[7, 7]]);
    expect(newSideRanges('@@ -5,2 +6,0 @@\n-x\n-y')).toEqual([]);
  });

  it('several hunks give several ranges in patch order', () => {
    const patch = '@@ -1,2 +1,2 @@\n a\n+b\n@@ -20,1 +30,3 @@\n+c\n+d\n+e';
    expect(newSideRanges(patch)).toEqual([
      [1, 2],
      [30, 32],
    ]);
  });

  it('no patch gives no ranges', () => {
    expect(newSideRanges(null)).toEqual([]);
    expect(newSideRanges('')).toEqual([]);
  });
});

describe('groundFocus (AC-10, AC-11)', () => {
  const files = [
    { path: 'src/a.ts', patch: PATCH },
    { path: 'nopatch.ts', patch: null },
  ];

  it('keeps only the context line inside a hunk; drops a foreign file, a line outside every hunk and a file without a patch', () => {
    const { kept, dropped } = groundFocus(
      [
        { file: 'other.ts', line: 1, reason: 'a' },
        { file: 'src/a.ts', line: 50, reason: 'b' },
        { file: 'src/a.ts', line: 12, reason: 'c' },
        { file: 'nopatch.ts', line: 5, reason: 'd' },
      ],
      files,
    );
    expect(kept).toEqual([{ file: 'src/a.ts', line: 12, reason: 'c' }]);
    expect(dropped).toBe(3);
  });

  it('the first and last line of a hunk are kept, the line either side is dropped', () => {
    const { kept } = groundFocus(
      [9, 10, 13, 14].map((line) => ({ file: 'src/a.ts', line, reason: `r${line}` })),
      files,
    );
    expect(kept.map((k) => k.line)).toEqual([10, 13]);
  });

  it('a +c,0 hunk covers no line; a +c hunk with d omitted covers c only', () => {
    const none = groundFocus([{ file: 'z.ts', line: 4, reason: 'r' }], [{ path: 'z.ts', patch: '@@ -3,2 +4,0 @@\n-a\n-b' }]);
    expect(none.kept).toEqual([]);
    const one = groundFocus(
      [
        { file: 'z.ts', line: 7, reason: 'r' },
        { file: 'z.ts', line: 8, reason: 'r' },
      ],
      [{ path: 'z.ts', patch: '@@ -5,2 +7 @@\n+x' }],
    );
    expect(one.kept.map((k) => k.line)).toEqual([7]);
  });
});

describe('groundRisks (AC-12)', () => {
  it('strips :n and :n-m, keeps changed paths once, drops unknown ones, keeps a risk whose list ends empty', () => {
    const { kept, droppedRefs } = groundRisks(
      [
        risk({ title: 'with refs', file_refs: ['src/a.ts:12-18', 'src/a.ts:3', 'x.ts'] }),
        risk({ title: 'no refs', file_refs: [] }),
      ],
      ['src/a.ts'],
    );
    expect(kept.map((r) => [r.title, r.file_refs])).toEqual([
      ['with refs', ['src/a.ts']],
      ['no refs', []],
    ]);
    expect(droppedRefs).toBe(2);
  });

  it('a risk whose only ref is unknown stays, with an empty list', () => {
    const { kept } = groundRisks([risk({ file_refs: ['gone.ts'] })], ['src/a.ts']);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.file_refs).toEqual([]);
  });
});

describe('ground then clamp (AC-13, A-9, A-31)', () => {
  it('8 risks and 8 focus items with one repeated file:line give 6 and 6 in model order, the repeat once and not counted toward the 6', () => {
    const files = [{ path: 'src/a.ts', patch: '@@ -1,20 +1,20 @@\n' + ' x\n'.repeat(20) }];
    // lines 1,2,2,3,4,5,6,7 -> unique 1..7 -> cap 6 -> 1..6
    const items = [1, 2, 2, 3, 4, 5, 6, 7].map((line, i) => ({ file: 'src/a.ts', line, reason: `r${i}` }));
    const grounded = groundFocus(items, files);
    expect(grounded.kept.map((k) => k.line)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(grounded.dropped).toBe(1);

    const risks = Array.from({ length: 8 }, (_, i) => risk({ title: `R${i + 1}` }));
    const out = clampAnswer({ summary: 'ok', risks, review_focus: grounded.kept });
    expect(out.risks.map((r) => r.title)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    expect(out.review_focus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cuts the summary to 600 chars, a title and a focus reason to 160, an explanation to 600, and refs to 6', () => {
    const out = clampAnswer({
      summary: 'x'.repeat(700),
      risks: [
        risk({
          title: 't'.repeat(200),
          explanation: 'e'.repeat(700),
          file_refs: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        }),
      ],
      review_focus: [{ file: 'src/a.ts', line: 11, reason: 'r'.repeat(200) }],
    });
    expect(out.summary).toHaveLength(600);
    expect(out.risks[0]!.title).toHaveLength(160);
    expect(out.risks[0]!.explanation).toHaveLength(600);
    expect(out.risks[0]!.file_refs).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(out.review_focus[0]!.reason).toHaveLength(160);
  });

  it('A-9: a summary that is blank after trimming is reported as empty; a padded one is trimmed', () => {
    expect(clampAnswer({ summary: '   \n ', risks: [], review_focus: [] }).emptySummary).toBe(true);
    const padded = clampAnswer({ summary: '  S  ', risks: [], review_focus: [] });
    expect(padded.summary).toBe('S');
    expect(padded.emptySummary).toBe(false);
  });
});

describe('stored shape (AC-3, AC-23)', () => {
  const generation = {
    head_sha: 'old1111',
    generated_at: '2026-10-09T10:00:00.000Z',
    provider: 'openai',
    model: 'gpt-4.1',
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    specs_read: [],
  };
  const brief = {
    intent: { intent: 'Do X', in_scope: [], out_of_scope: [] },
    blast: { changed_symbols: [], downstream: [], summary: '' },
    risks: { risks: [] },
    history: { history: [] },
    summary: 'S',
    review_focus: [],
    generation,
  };

  it('parseStoredBrief: a valid brief round-trips; {"x":1} is null', () => {
    expect(parseStoredBrief(brief)).toEqual(brief);
    expect(parseStoredBrief({ x: 1 })).toBeNull();
  });

  it('toBriefResponse: stale only when a brief exists and its head differs; generating is passed through', () => {
    const parsed = parseStoredBrief(brief)!;
    expect(toBriefResponse(parsed, 'old1111', false)).toMatchObject({ stale: false, generating: false });
    expect(toBriefResponse(parsed, 'new2222', true)).toMatchObject({ stale: true, generating: true });
    expect(toBriefResponse(null, 'new2222', false)).toEqual({ brief: null, generating: false, stale: false });
  });
});
