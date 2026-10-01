import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildUserPrompt, intentPromptSections, SYSTEM_PROMPT } from '../src/modules/intent/prompt.js';
import type { GatherPull, IntentBundle } from '../src/modules/intent/types.js';

/**
 * WP4.tests + AC-8 for the intent prompt. `intentPromptSections` describes the
 * prompt without its content; `buildUserPrompt` / `SYSTEM_PROMPT` stay
 * byte-identical to the pre-change snapshot d17edf2 (golden fixture, generated
 * by running that snapshot's code on the stored inputs).
 */

interface GoldenCase {
  name: string;
  input: { bundle: IntentBundle; pull: GatherPull; repo: { owner: string; name: string } };
  system: string;
  user: string;
}
const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/intent-prompt-golden.json', import.meta.url)), 'utf8'),
) as GoldenCase[];

describe('intent prompt is byte-identical to the pre-change snapshot (AC-8)', () => {
  for (const c of golden) {
    it(`${c.name}: system prompt and user prompt`, () => {
      expect(SYSTEM_PROMPT).toBe(c.system);
      expect(buildUserPrompt(c.input.bundle, c.input.pull, c.input.repo)).toBe(c.user);
    });
  }
});

describe('intentPromptSections', () => {
  const full = golden.find((c) => c.name === 'full')!.input.bundle;
  const sparse = golden.find((c) => c.name === 'sparse')!.input.bundle;

  const withSentinel: IntentBundle = {
    ...full,
    specs: [{ path: 'docs/specs/x.md', text: 'SPEC-SENTINEL-42 plus the spec body' }],
    tickets: [{ n: 471, title: 'Rate limit API', body: 'ISSUE-BODY-SENTINEL' }],
    body: 'PR-BODY-SENTINEL',
    diffExcerpt: '+const k = "AKIAIOSFODNN7EXAMPLE";',
  };

  it('describes the ticket by ref and the spec as untrusted by path; system first, instruction last', () => {
    const sections = intentPromptSections(withSentinel);
    expect(sections[0]!.name).toBe('system');
    expect(sections[sections.length - 1]!.name).toBe('instruction');
    expect(sections.find((s) => s.name === 'ticket')).toMatchObject({ name: 'ticket', ref: '#471' });
    expect(sections.find((s) => s.name === 'spec')).toMatchObject({
      name: 'spec',
      ref: 'docs/specs/x.md',
      trust: 'untrusted',
    });
  });

  it('serialized output holds no spec text, issue body, PR body or secret', () => {
    const json = JSON.stringify(intentPromptSections(withSentinel));
    expect(json).not.toContain('SPEC-SENTINEL-42');
    expect(json).not.toContain('ISSUE-BODY-SENTINEL');
    expect(json).not.toContain('PR-BODY-SENTINEL');
    expect(json).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(json).not.toContain('Rate limit API');
  });

  it('uses the Contract table names, sources and trust, in render order', () => {
    expect(intentPromptSections(full).map((s) => [s.name, s.source, s.trust])).toEqual([
      ['system', 'intent.system_prompt', 'trusted'],
      ['title', 'pr.title', 'untrusted'],
      ['description', 'pr.body', 'untrusted'],
      ['ticket', 'tracker', 'untrusted'],
      ['spec', 'repo.spec', 'untrusted'],
      ['commits', 'git.commits', 'untrusted'],
      ['branch', 'pr.branch', 'untrusted'],
      ['files', 'pr.files', 'untrusted'],
      ['diff', 'pr.diff_excerpt', 'untrusted'],
      ['instruction', 'intent.instruction', 'trusted'],
    ]);
  });

  it('counts items for commits (2) and files (2) only', () => {
    const items = Object.fromEntries(intentPromptSections(full).map((s) => [s.name, s.items]));
    expect(items.commits).toBe(2);
    expect(items.files).toBe(2);
    expect(items.title).toBeUndefined();
    expect(items.spec).toBeUndefined();
  });

  it('a bundle with only a title lists system, title, instruction', () => {
    expect(intentPromptSections(sparse).map((s) => s.name)).toEqual(['system', 'title', 'instruction']);
  });

  it('every tokensEst is ceil(chars/4)', () => {
    for (const s of intentPromptSections(full)) expect(s.tokensEst).toBe(Math.ceil(s.chars / 4));
  });

  it('the system section is the real system prompt (its length)', () => {
    expect(intentPromptSections(full)[0]!.chars).toBe(SYSTEM_PROMPT.length);
  });
});
