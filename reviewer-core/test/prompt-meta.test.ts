import { describe, it, expect } from 'vitest';
import { assemblePrompt, describeSection, estimateTokens } from '../src/index.js';

/**
 * Prompt-assembly logging, reviewer-core half (server/specs/L03-prompt-logging.md,
 * WP2.tests): content-free section metadata. Expected values come from the spec's
 * Contract table and the plan's Test brief, not from the implementation.
 */

const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

describe('estimateTokens', () => {
  it('is ceil(chars / 4)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('x'.repeat(401))).toBe(101);
  });
});

describe('describeSection', () => {
  it('measures the text and keeps a 12-hex sha256 of it (sha256("abc") = ba7816bf8f01…)', () => {
    const m = describeSection({ name: 'n', source: 's', trust: 'trusted', text: 'abc' });
    expect(m).toEqual({
      name: 'n',
      source: 's',
      trust: 'trusted',
      chars: 3,
      tokensEst: 1,
      sha256: 'ba7816bf8f01',
    });
  });

  it('carries ref and items only when given', () => {
    const m = describeSection({
      name: 'spec',
      source: 'repo.spec',
      trust: 'untrusted',
      text: 'abcde',
      ref: 'docs/x.md',
      items: 2,
    });
    expect(m.ref).toBe('docs/x.md');
    expect(m.items).toBe(2);
    expect(m.tokensEst).toBe(2);
    const bare = describeSection({ name: 'n', source: 's', trust: 'trusted', text: 'abc' });
    expect('ref' in bare).toBe(false);
    expect('items' in bare).toBe(false);
  });

  it('never carries the section text (a secret in the text stays out of the metadata)', () => {
    const m = describeSection({
      name: 'diff',
      source: 'pr.diff',
      trust: 'untrusted',
      text: `+ const k = "${AWS_KEY}";`,
    });
    expect(JSON.stringify(m)).not.toContain(AWS_KEY);
    expect(JSON.stringify(m)).not.toContain('const k');
  });
});

describe('assemblePrompt(...).sections', () => {
  const FULL = {
    system: 'SYS-PROMPT',
    skills: ['skill one', 'skill two'],
    memory: ['mem a', 'mem b', 'mem c'],
    specs: ['spec a', 'spec b'],
    repoMap: 'MAP',
    callers: 'CALLERS',
    prDescription: 'Adds a limiter.',
    intent: {
      statement: 'Add rate limiting',
      inScope: ['api'],
      outOfScope: ['billing'],
      confidence: 'high' as const,
    },
    diff: 'DIFF-BODY',
    task: 'Review PR #1',
  };

  it('lists every section in render order with the Contract table source and trust', () => {
    const { sections } = assemblePrompt(FULL);
    expect(sections.map((s) => [s.name, s.source, s.trust])).toEqual([
      ['system', 'agent.system_prompt', 'trusted'],
      ['injection_guard', 'reviewer-core.guard', 'trusted'],
      ['task', 'server.task_line', 'untrusted'],
      ['pr_description', 'pr.body', 'untrusted'],
      ['intent', 'intent.derived', 'untrusted'],
      ['skills', 'agent.skills', 'trusted'],
      ['memory', 'memory', 'trusted'],
      ['repo_map', 'repo-intel.map', 'untrusted'],
      ['specs', 'specs', 'untrusted'],
      ['callers', 'repo-intel.callers', 'untrusted'],
      ['diff', 'pr.diff', 'untrusted'],
    ]);
  });

  it('counts items for skills, memory and specs only', () => {
    const { sections } = assemblePrompt(FULL);
    const items = Object.fromEntries(sections.map((s) => [s.name, s.items]));
    expect(items.skills).toBe(2);
    expect(items.memory).toBe(3);
    expect(items.specs).toBe(2);
    expect(items.diff).toBeUndefined();
    expect(items.system).toBeUndefined();
  });

  it('plan example: system + 2 skills + PR body + diff, no task -> no task section', () => {
    const { sections } = assemblePrompt({
      system: 'sys',
      skills: ['a', 'b'],
      prDescription: 'body',
      diff: 'D',
    });
    expect(sections.map((s) => s.name)).toEqual([
      'system',
      'injection_guard',
      'pr_description',
      'skills',
      'diff',
    ]);
    expect(sections.find((s) => s.name === 'skills')!.items).toBe(2);
  });

  it('omits absent and blank sections (not listed)', () => {
    const { sections } = assemblePrompt({
      system: 'sys',
      skills: [],
      memory: [],
      specs: [],
      repoMap: '  ',
      callers: ' ',
      prDescription: '   ',
      diff: 'D',
    });
    expect(sections.map((s) => s.name)).toEqual(['system', 'injection_guard', 'diff']);
  });

  it('every tokensEst is ceil(chars/4) and every sha256 is 12 hex chars', () => {
    for (const s of assemblePrompt(FULL).sections) {
      expect(s.tokensEst).toBe(Math.ceil(s.chars / 4));
      expect(s.sha256).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it('chars describe the rendered text: diff section is the literal wrapped block', () => {
    const { sections } = assemblePrompt({ system: 'sys', diff: 'DIFF' });
    const diff = sections.find((s) => s.name === 'diff')!;
    const rendered = '## Diff to review\n<untrusted source="diff">\nDIFF\n</untrusted>';
    expect(diff.chars).toBe(rendered.length);
    expect(sections.find((s) => s.name === 'system')!.chars).toBe('sys'.length);
  });

  it('user-side sections add up to the user message (sections joined by a blank line)', () => {
    const { sections, messages } = assemblePrompt(FULL);
    const userNames = new Set(['task', 'pr_description', 'intent', 'skills', 'memory', 'repo_map', 'specs', 'callers', 'diff']);
    const user = sections.filter((s) => userNames.has(s.name));
    const total = user.reduce((n, s) => n + s.chars, 0) + 2 * (user.length - 1);
    expect(total).toBe(messages[1]!.content.length);
  });

  it('the system section is the agent prompt; with the guard it adds up to the system message', () => {
    const { sections, messages } = assemblePrompt(FULL);
    const sys = sections.find((s) => s.name === 'system')!;
    const guard = sections.find((s) => s.name === 'injection_guard')!;
    expect(sys.chars).toBe(FULL.system.length);
    expect(sys.chars + 2 + guard.chars).toBe(messages[0]!.content.length);
  });

  it('metadata never contains section text, including a secret in the diff and PR body', () => {
    const { sections } = assemblePrompt({
      system: 'sys',
      prDescription: `see ${AWS_KEY} in the docs`,
      diff: `+ const k = "${AWS_KEY}";`,
    });
    const json = JSON.stringify(sections);
    expect(json).not.toContain(AWS_KEY);
    expect(json).not.toContain('const k');
    expect(json).not.toContain('see ');
  });

  it('the hash follows the content (same text same hash, different text different hash)', () => {
    const a = assemblePrompt({ system: 'sys', diff: 'ONE' }).sections.find((s) => s.name === 'diff')!;
    const b = assemblePrompt({ system: 'sys', diff: 'ONE' }).sections.find((s) => s.name === 'diff')!;
    const c = assemblePrompt({ system: 'sys', diff: 'TWO' }).sections.find((s) => s.name === 'diff')!;
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).not.toBe(c.sha256);
  });
});
