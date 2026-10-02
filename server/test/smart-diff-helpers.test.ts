import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from '../src/modules/reviews/smart-diff/helpers.js';

describe('buildSmartDiff', () => {
  const files = [
    { path: 'b.ts', additions: 1, deletions: 0 },
    { path: 'a.ts', additions: 10, deletions: 2 },
    { path: 'README.md', additions: 1, deletions: 1 },
    { path: 'pnpm-lock.yaml', additions: 100, deletions: 50 },
  ];
  const findings = [
    { file: 'a.ts', startLine: 30 },
    { file: 'a.ts', startLine: 12 },
    { file: 'a.ts', startLine: 12 },
    { file: 'gone.ts', startLine: 3 },
  ];

  it('groups in display order, omits empty groups, sorts files by path', () => {
    const { diff } = buildSmartDiff(files, findings);

    expect(diff.groups.map((g) => g.role)).toEqual(['core', 'docs', 'boilerplate']);
    const core = diff.groups[0]!;
    expect(core.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('finding_lines are unique and ascending; unmatched findings are dropped', () => {
    const { diff } = buildSmartDiff(files, findings);
    const core = diff.groups[0]!;

    expect(core.files.find((f) => f.path === 'a.ts')!.finding_lines).toEqual([12, 30]);
    expect(core.files.find((f) => f.path === 'b.ts')!.finding_lines).toEqual([]);
  });

  it('split_suggestion totals additions + deletions; no pseudocode_summary key', () => {
    const { diff } = buildSmartDiff(files, findings);

    expect(diff.split_suggestion).toEqual({ too_big: false, total_lines: 165, proposed_splits: [] });
    for (const g of diff.groups) {
      for (const f of g.files) expect('pseudocode_summary' in f).toBe(false);
    }
  });

  it('stats: files per role, files with findings, unmatched findings', () => {
    const { stats } = buildSmartDiff(files, findings);

    expect(stats).toEqual({
      roles: { core: 2, tests: 0, wiring: 0, docs: 1, boilerplate: 1 },
      filesWithFindings: 1,
      unmatchedFindings: 1,
    });
  });

  it('empty input → no groups, zero total_lines', () => {
    const { diff } = buildSmartDiff([], []);

    expect(diff.groups).toEqual([]);
    expect(diff.split_suggestion.total_lines).toBe(0);
  });
});
