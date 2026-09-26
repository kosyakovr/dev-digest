import { describe, it, expect } from 'vitest';
import {
  buildSkillDraft,
  dedupeCandidates,
  renderSample,
  renderSamples,
  repoSlug,
  ruleKey,
  slugify,
  toSampledFile,
  verifyCandidate,
  type RawCandidate,
  type SampledFile,
  type VerifiedCandidate,
} from '../src/modules/conventions/helpers.js';
import { MAX_FILE_LINES, MIN_SNIPPET_CHARS } from '../src/modules/conventions/constants.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

/**
 * L02 conventions — the pure half: the sample the model sees, the evidence gate
 * that decides which of its answers survive, and the assembled skill body.
 * No DB, no model, so this lane runs without Docker.
 */

const FILE = [
  'import { z } from "zod";',
  '',
  'export const UserSchema = z.object({',
  '  id: z.string().uuid(),',
  '});',
  '',
  'export async function findUser(id: string) {',
  '  throw new NotFoundError("user");',
  '}',
].join('\n');

function sampleMap(entries: Record<string, string>): Map<string, SampledFile> {
  const m = new Map<string, SampledFile>();
  for (const [path, raw] of Object.entries(entries)) m.set(path, toSampledFile(path, raw));
  return m;
}

const raw = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  category: 'typing',
  rule: 'Validate request bodies with a Zod schema.',
  rationale: 'Every public shape is parsed at the edge.',
  evidence_path: 'src/user.ts',
  evidence_line: 3,
  evidence_snippet: 'export const UserSchema = z.object({',
  confidence: 0.8,
  ...over,
});

// ---- sampling -------------------------------------------------------------

describe('sample rendering', () => {
  it('renders a 1-based line gutter — the thing that makes a citation checkable', () => {
    const out = renderSample(toSampledFile('src/user.ts', FILE));
    expect(out.startsWith('--- FILE: src/user.ts ---\n')).toBe(true);
    expect(out).toContain('1\timport { z } from "zod";');
    expect(out).toContain('3\texport const UserSchema = z.object({');
    expect(out).not.toContain('… (truncated)');
  });

  it('truncates a long file to the per-file line cap and says so', () => {
    const long = Array.from({ length: MAX_FILE_LINES + 50 }, (_, i) => `line ${i + 1}`).join('\n');
    const f = toSampledFile('big.ts', long);
    expect(f.lines).toHaveLength(MAX_FILE_LINES);
    expect(f.truncated).toBe(true);
    expect(renderSample(f)).toContain('… (truncated)');
  });

  it('stops before the whole-sample budget instead of overflowing it', () => {
    const files = [
      toSampledFile('a.ts', 'const a = 1;'),
      toSampledFile('b.ts', 'const b = 2;'),
      toSampledFile('c.ts', 'const c = 3;'),
    ];
    const whole = renderSamples(files, 10_000);
    expect(whole).toContain('a.ts');
    expect(whole).toContain('c.ts');

    const clipped = renderSamples(files, renderSample(files[0]!).length + 5);
    expect(clipped).toContain('a.ts');
    expect(clipped).not.toContain('b.ts');
  });
});

// ---- the evidence gate ----------------------------------------------------

describe('verifyCandidate', () => {
  const files = sampleMap({ 'src/user.ts': FILE });

  it('keeps a grounded candidate and slices the snippet from the file', () => {
    const res = verifyCandidate(files, raw());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidate.evidencePath).toBe('src/user.ts');
    expect(res.candidate.evidenceLine).toBe(3);
    expect(res.candidate.evidenceSnippet).toBe('export const UserSchema = z.object({');
    expect(res.candidate.category).toBe('typing');
  });

  it('CORRECTS a wrong line number rather than dropping the candidate', () => {
    const res = verifyCandidate(files, raw({ evidence_line: 42 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidate.evidenceLine).toBe(3);
  });

  it('drops a snippet that is not in the cited file', () => {
    const res = verifyCandidate(files, raw({ evidence_snippet: 'export const Invented = 1;' }));
    expect(res).toEqual({ ok: false, reason: 'snippet_not_found' });
  });

  it('drops a citation of a file that was never sampled', () => {
    const res = verifyCandidate(files, raw({ evidence_path: 'src/nowhere.ts' }));
    expect(res).toEqual({ ok: false, reason: 'unknown_file' });
  });

  it('drops a snippet too short to identify anything', () => {
    expect('});'.replace(/\s/g, '').length).toBeLessThan(MIN_SNIPPET_CHARS);
    const res = verifyCandidate(files, raw({ evidence_snippet: '});' }));
    expect(res).toEqual({ ok: false, reason: 'snippet_too_short' });
  });

  it('drops an empty rule', () => {
    expect(verifyCandidate(files, raw({ rule: '   ' }))).toEqual({
      ok: false,
      reason: 'empty_rule',
    });
  });

  it('accepts a path cited with a ./ prefix or a unique basename', () => {
    expect(verifyCandidate(files, raw({ evidence_path: './src/user.ts' })).ok).toBe(true);
    expect(verifyCandidate(files, raw({ evidence_path: 'user.ts' })).ok).toBe(true);
  });

  it('refuses an AMBIGUOUS suffix instead of guessing which file was meant', () => {
    const two = sampleMap({ 'src/a/user.ts': FILE, 'src/b/user.ts': FILE });
    expect(verifyCandidate(two, raw({ evidence_path: 'user.ts' }))).toEqual({
      ok: false,
      reason: 'unknown_file',
    });
  });

  it('tolerates the model echoing our line-number gutter back', () => {
    const res = verifyCandidate(
      files,
      raw({ evidence_snippet: '3\texport const UserSchema = z.object({' }),
    );
    expect(res.ok).toBe(true);
  });

  it('resolves a repeated line to the occurrence nearest the claimed line', () => {
    const repeated = sampleMap({ 'r.ts': ['const x = 1;', 'other', 'const x = 1;'].join('\n') });
    const res = verifyCandidate(
      repeated,
      raw({ evidence_path: 'r.ts', evidence_snippet: 'const x = 1;', evidence_line: 3 }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.candidate.evidenceLine).toBe(3);
  });

  it('falls back to `general` for a category outside the contract', () => {
    const res = verifyCandidate(files, raw({ category: 'vibes' }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.candidate.category).toBe('general');
  });

  it('dedents a nested snippet and clamps confidence into 0..1', () => {
    const nested = sampleMap({ 'n.ts': 'function f() {\n    const deep = compute(1);\n}' });
    const res = verifyCandidate(
      nested,
      raw({ evidence_path: 'n.ts', evidence_snippet: 'const deep = compute(1);', confidence: 4 }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.candidate.evidenceSnippet).toBe('const deep = compute(1);');
    expect(res.candidate.confidence).toBe(1);
  });
});

// ---- dedupe ---------------------------------------------------------------

describe('dedupeCandidates', () => {
  const c = (rule: string, confidence = 0.5): VerifiedCandidate => ({
    category: 'general',
    rule,
    rationale: null,
    evidencePath: 'a.ts',
    evidenceLine: 1,
    evidenceSnippet: 'const a = 1;',
    confidence,
  });

  it('keeps the first of two rules that differ only in punctuation and case', () => {
    const { kept, dropped } = dedupeCandidates([c('Use Zod at the edge.', 0.9), c('use zod at the edge')]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.confidence).toBe(0.9);
    expect(dropped).toBe(1);
  });

  it('drops a rule the user already decided on in an earlier scan', () => {
    const { kept, dropped } = dedupeCandidates([c('Use Zod at the edge.')], [
      ruleKey('use zod at the edge'),
    ]);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });
});

// ---- skill assembly -------------------------------------------------------

describe('buildSkillDraft', () => {
  const row = (over: Partial<ConventionRow> = {}): ConventionRow =>
    ({
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: 'w',
      repoId: 'r',
      rule: 'Validate request bodies with a Zod schema.',
      rationale: 'Every public shape is parsed at the edge.',
      category: 'typing',
      evidencePath: 'src/user.ts',
      evidenceLine: 3,
      evidenceSnippet: 'export const UserSchema = z.object({',
      confidence: 0.8,
      status: 'accepted',
      createdAt: new Date('2026-09-22T10:00:00Z'),
      ...over,
    }) as ConventionRow;

  it('names the skill after the repo and carries every rule with its evidence', () => {
    const draft = buildSkillDraft('acme/payments-api', [row(), row({ id: '2', rule: 'Log errors once.' })]);
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.type).toBe('convention');
    expect(draft.description).toContain('2 house conventions');
    expect(draft.body).toContain('Validate request bodies with a Zod schema.');
    expect(draft.body).toContain('Detected in `src/user.ts:3`:');
    expect(draft.body).toContain('export const UserSchema = z.object({');
    expect(draft.evidence_files).toEqual(['src/user.ts']);
    expect(draft.convention_ids).toHaveLength(2);
  });

  it('says "convention" in the singular for one rule', () => {
    expect(buildSkillDraft('acme/api', [row()]).description).toContain('1 house convention ');
  });

  it('slugifies a rule into a section anchor and a repo into a name', () => {
    expect(slugify('Always use async/await, never .then()')).toBe('always-use-asyncawait-never-then');
    expect(slugify('!!!')).toBe('rule');
    expect(repoSlug('CenterForOpenScience/angular-osf')).toBe('angular-osf');
  });
});
