import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { groundFindings } from '../src/index.js';
import { MockGitClient } from '../../server/src/adapters/mocks.js';

/**
 * pr-self-review F1-2: a dropped finding carries a machine-readable `code`, so
 * callers branch on it instead of matching the human `reason` text.
 */
const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,1 +1,2 @@',
  ' keep',
  '+const a = 1;',
].join('\n');

const finding = (file: string, line: number): Finding => ({
  id: `f-${file}-${line}`,
  severity: 'WARNING',
  category: 'bug',
  title: 'T',
  file,
  start_line: line,
  end_line: line,
  rationale: 'r',
  confidence: 0.5,
  kind: 'finding',
});

describe('groundFindings drop codes', () => {
  it('a finding on a file that is not in the diff -> file_not_in_diff', async () => {
    const diff = await new MockGitClient({ diff: DIFF }).diff();
    const r = groundFindings([finding('src/missing.ts', 1)], diff);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped.map((d) => d.code)).toEqual(['file_not_in_diff']);
  });

  it('a finding on a line outside every hunk of a file that is in the diff -> lines_not_in_hunk', async () => {
    const diff = await new MockGitClient({ diff: DIFF }).diff();
    const r = groundFindings([finding('src/a.ts', 999)], diff);
    expect(r.dropped.map((d) => d.code)).toEqual(['lines_not_in_hunk']);
  });

  it('each drop in a mixed batch gets its own code; a kept finding is not in dropped', async () => {
    const diff = await new MockGitClient({ diff: DIFF }).diff();
    const r = groundFindings([finding('src/a.ts', 2), finding('src/missing.ts', 1), finding('src/a.ts', 999)], diff);
    expect(r.kept.map((f) => f.start_line)).toEqual([2]);
    expect(r.dropped.map((d) => [d.finding.file, d.finding.start_line, d.code])).toEqual([
      ['src/missing.ts', 1, 'file_not_in_diff'],
      ['src/a.ts', 999, 'lines_not_in_hunk'],
    ]);
  });
});
