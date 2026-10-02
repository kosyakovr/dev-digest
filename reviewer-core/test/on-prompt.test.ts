import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest, type PromptEvent, type ReviewEvent } from '../src/index.js';

/**
 * `onPrompt` + `mirrorMsg` (server/specs/L03-prompt-logging.md, WP2.tests, AM2).
 * The LLM is a stub that records call order; no I/O.
 */

const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

const fileDiff = (path: string, added: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n keep\n+${added}`;

const THREE_FILES = [
  fileDiff('src/a.ts', 'const a = 1;'),
  fileDiff('src/b.ts', `const k = "${AWS_KEY}";`),
  fileDiff('src/c.ts', 'const c = 3;'),
].join('\n');

const CLEAN = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

function stubLlm(order: string[], fixture: unknown = CLEAN): LLMProvider {
  return {
    id: 'openai',
    async completeStructured<T>(req): Promise<StructuredResult<T>> {
      order.push('llm');
      return {
        data: fixture as T,
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
        raw: '',
        attempts: 1,
      };
    },
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('not used');
    },
    async embed() {
      return [];
    },
  };
}

async function diffOf(raw: string) {
  return new MockGitClient({ diff: raw }).diff();
}

describe('reviewPullRequest onPrompt', () => {
  it('map-reduce over 3 files: fires once per chunk, each BEFORE its LLM call', async () => {
    const order: string[] = [];
    const events: PromptEvent[] = [];
    await reviewPullRequest({
      systemPrompt: 'agent system',
      model: 'm',
      diff: await diffOf(THREE_FILES),
      llm: stubLlm(order),
      strategy: 'map-reduce',
      onPrompt: (e) => {
        order.push('prompt');
        events.push(e);
      },
    });
    expect(order).toEqual(['prompt', 'llm', 'prompt', 'llm', 'prompt', 'llm']);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.chunk.index)).toEqual([0, 1, 2]);
    expect(events.map((e) => e.chunk.label)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    for (const e of events) {
      expect(e.mode).toBe('map-reduce');
      expect(e.chunkCount).toBe(3);
    }
  });

  it('the overall diff section is the WHOLE diff; a chunk diff section is only its slice', async () => {
    const events: PromptEvent[] = [];
    const diff = await diffOf(THREE_FILES);
    await reviewPullRequest({
      systemPrompt: 'agent system',
      model: 'm',
      diff,
      llm: stubLlm([]),
      strategy: 'map-reduce',
      onPrompt: (e) => events.push(e),
    });
    const wholeRendered = `## Diff to review\n<untrusted source="diff">\n${diff.raw}\n</untrusted>`;
    const overallDiff = events[0]!.overall.find((s) => s.name === 'diff')!;
    expect(overallDiff.chars).toBe(wholeRendered.length);
    for (const e of events) {
      expect(e.overall).toEqual(events[0]!.overall);
      const chunkDiff = e.chunk.sections.find((s) => s.name === 'diff')!;
      expect(chunkDiff.chars).toBeLessThan(overallDiff.chars);
      // Everything but the diff is shared by every chunk.
      const rest = (ss: PromptEvent['overall']) => ss.filter((s) => s.name !== 'diff');
      expect(rest(e.chunk.sections)).toEqual(rest(e.overall));
    }
  });

  it('overallChars is the exact length of the whole-diff messages', async () => {
    const events: PromptEvent[] = [];
    const diff = await diffOf(THREE_FILES);
    await reviewPullRequest({
      systemPrompt: 'agent system',
      model: 'm',
      diff,
      llm: stubLlm([]),
      strategy: 'map-reduce',
      task: 'Review PR #9',
      onPrompt: (e) => events.push(e),
    });
    const e = events[0]!;
    // system message = agent prompt + blank line + guard; user = sections joined by a blank line.
    const byName = Object.fromEntries(e.overall.map((s) => [s.name, s.chars]));
    const userChars = e.overall
      .filter((s) => s.name !== 'system' && s.name !== 'injection_guard')
      .reduce((n, s) => n + s.chars, 0);
    const userSeparators = 2 * (e.overall.length - 2 - 1);
    expect(e.overallChars).toBe(byName.system! + 2 + byName.injection_guard! + userChars + userSeparators);
  });

  it('single-pass: one event, label "all files", chunk sections equal the overall ones', async () => {
    const order: string[] = [];
    const events: PromptEvent[] = [];
    await reviewPullRequest({
      systemPrompt: 'agent system',
      model: 'm',
      diff: await diffOf(THREE_FILES),
      llm: stubLlm(order),
      strategy: 'single-pass',
      onPrompt: (e) => {
        order.push('prompt');
        events.push(e);
      },
    });
    expect(order).toEqual(['prompt', 'llm']);
    expect(events).toHaveLength(1);
    expect(events[0]!.mode).toBe('single-pass');
    expect(events[0]!.chunkCount).toBe(1);
    expect(events[0]!.chunk.index).toBe(0);
    expect(events[0]!.chunk.label).toBe('all files');
    expect(events[0]!.chunk.sections).toEqual(events[0]!.overall);
  });

  it('a throwing onPrompt never fails the review: every LLM call still happens', async () => {
    const order: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'agent system',
      model: 'm',
      diff: await diffOf(THREE_FILES),
      llm: stubLlm(order),
      strategy: 'map-reduce',
      onPrompt: () => {
        throw new Error('logging blew up');
      },
    });
    expect(order).toEqual(['llm', 'llm', 'llm']);
    expect(outcome.review.verdict).toBe('approve');
    expect(outcome.mode).toBe('map-reduce');
  });

  it('the event is content-free: no diff body, no secret, no system prompt text', async () => {
    const events: PromptEvent[] = [];
    await reviewPullRequest({
      systemPrompt: 'SYSTEM-SENTINEL-TEXT',
      model: 'm',
      diff: await diffOf(THREE_FILES),
      llm: stubLlm([]),
      strategy: 'map-reduce',
      prDescription: 'PR-BODY-SENTINEL-TEXT',
      onPrompt: (e) => events.push(e),
    });
    const json = JSON.stringify(events);
    expect(json).not.toContain(AWS_KEY);
    expect(json).not.toContain('const a = 1');
    expect(json).not.toContain('SYSTEM-SENTINEL-TEXT');
    expect(json).not.toContain('PR-BODY-SENTINEL-TEXT');
  });
});

describe('grounding drops: mirrorMsg (AM2)', () => {
  const finding = (title: string, file: string, line: number) => ({
    id: 'f',
    severity: 'WARNING',
    category: 'bug',
    title,
    file,
    start_line: line,
    end_line: line,
    rationale: 'r',
    confidence: 0.5,
    kind: 'finding',
  });

  async function dropEvents(f: ReturnType<typeof finding>): Promise<ReviewEvent[]> {
    const events: ReviewEvent[] = [];
    await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: await diffOf(fileDiff('src/a.ts', 'const a = 1;')),
      llm: stubLlm([], { verdict: 'comment', summary: 's', score: 50, findings: [f] }),
      onEvent: (e) => events.push(e),
    });
    return events.filter((e) => e.msg.startsWith('grounding dropped'));
  }

  it('line not in diff: the live-log msg keeps the title, the mirror has only a count and a generic reason', async () => {
    const dropped = await dropEvents(finding('SPEC-SENTINEL-42 phantom', 'src/a.ts', 999));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.msg).toContain('SPEC-SENTINEL-42 phantom');
    expect(dropped[0]!.mirrorMsg).toBe('grounding dropped 1 finding(s) (reason: line not in diff)');
  });

  it('file not in diff: the mirror carries neither the title nor the model-chosen path', async () => {
    const dropped = await dropEvents(finding('SPEC-SENTINEL-42 phantom', 'src/MODEL-CHOSEN-PATH.ts', 1));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.msg).toContain('SPEC-SENTINEL-42 phantom');
    expect(dropped[0]!.mirrorMsg).toBe('grounding dropped 1 finding(s) (reason: file not in diff)');
    expect(dropped[0]!.mirrorMsg).not.toContain('SPEC-SENTINEL-42');
    expect(dropped[0]!.mirrorMsg).not.toContain('MODEL-CHOSEN-PATH');
  });

  it('events that carry no model text have no mirrorMsg (the mirror falls back to msg)', async () => {
    const events: ReviewEvent[] = [];
    await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff: await diffOf(fileDiff('src/a.ts', 'x')),
      llm: stubLlm([]),
      onEvent: (e) => events.push(e),
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.mirrorMsg === undefined)).toBe(true);
  });
});
