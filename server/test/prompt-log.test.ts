import { describe, it, expect } from 'vitest';
import { describeSection, type PromptSectionMeta } from '@devdigest/reviewer-core';
import {
  childLogger,
  logPrompt,
  logPromptDetail,
  promptLogPayload,
  type ChildableLogger,
  type PromptLogInput,
} from '../src/platform/prompt-log.js';

/**
 * Prompt-log payloads (server/specs/L03-prompt-logging.md § Log lines; AC-2, AC-6, AC-7).
 * `prompt: assembled` never carries sha256 / preview / order / chunk; the verbose
 * `prompt: detail` adds hashes, the order and a masked preview on `system` only.
 */

const GHP = `ghp_${'a1B2c3D4e5'.repeat(4).slice(0, 36)}`; // ghp_ + 36 chars
const FORBIDDEN_DEFAULT_KEYS = ['sha256', 'preview', 'order', 'chunk'];
const CONTENT_KEYS = ['diff', 'body', 'content', 'text'];

const sec = (name: string, text: string, extra: Partial<Parameters<typeof describeSection>[0]> = {}) =>
  describeSection({ name, source: `src.${name}`, trust: 'untrusted', text, ...extra });

const sections: PromptSectionMeta[] = [
  sec('system', 'SYSTEM', { trust: 'trusted' }),
  sec('injection_guard', 'GUARD', { trust: 'trusted' }),
  sec('skills', 'skill text', { trust: 'trusted', items: 2 }),
  sec('diff', 'DIFF TEXT'),
];

function input(over: Partial<PromptLogInput> = {}): PromptLogInput {
  return {
    kind: 'review',
    provider: 'openai',
    model: 'gpt-4.1',
    strategy: 'map-reduce',
    chunks: 3,
    sections,
    totalChars: 1000,
    systemPrompt: 'You are the SECURITY agent.',
    ...over,
  };
}

/** Every key, at any depth. */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      allKeys(x, out);
    }
  }
  return out;
}

const chunks = [0, 1, 2].map((index) => ({
  index,
  of: 3,
  label: `src/f${index}.ts`,
  sections: [...sections.slice(0, 3), sec('diff', `slice ${index}`)],
}));

describe('promptLogPayload — default mode (the prompt: assembled line)', () => {
  const { info, debug } = promptLogPayload(input({ detailChunks: chunks }), 'default');

  it('carries kind, provider, model, strategy, chunks and the totals', () => {
    expect(info).toMatchObject({
      kind: 'review',
      provider: 'openai',
      model: 'gpt-4.1',
      strategy: 'map-reduce',
      chunks: 3,
      totalChars: 1000,
      totalTokensEst: 250,
    });
  });

  it('lists each section with name, source, trust, chars and tokensEst (items when counted)', () => {
    const secs = info.sections as Record<string, unknown>[];
    expect(secs.map((s) => s.name)).toEqual(['system', 'injection_guard', 'skills', 'diff']);
    expect(secs[2]).toEqual({
      name: 'skills',
      source: 'src.skills',
      trust: 'trusted',
      chars: 'skill text'.length,
      tokensEst: Math.ceil('skill text'.length / 4),
      items: 2,
    });
    expect(secs[0]).not.toHaveProperty('items');
  });

  it('has no sha256, preview, order or chunk key anywhere, and no debug lines', () => {
    const keys = allKeys(info);
    for (const k of FORBIDDEN_DEFAULT_KEYS) expect(keys).not.toContain(k);
    expect(debug).toEqual([]);
  });

  it('never contains the system prompt text', () => {
    expect(JSON.stringify(info)).not.toContain('SECURITY agent');
  });

  it('intent kind carries the trigger and no review-only fields', () => {
    const p = promptLogPayload(
      { kind: 'intent', provider: 'openrouter', model: 'm', trigger: 'manual', sections, totalChars: 40 },
      'default',
    );
    expect(p.info).toMatchObject({ kind: 'intent', trigger: 'manual', totalChars: 40, totalTokensEst: 10 });
    expect(p.info).not.toHaveProperty('strategy');
    expect(p.info).not.toHaveProperty('chunks');
  });
});

describe('promptLogPayload — verbose mode (the prompt: detail lines)', () => {
  it('one debug entry per chunk with its index, of and label', () => {
    const { info, debug } = promptLogPayload(input({ detailChunks: chunks }), 'verbose');
    expect(debug).toHaveLength(3);
    expect(debug.map((d) => d.chunk)).toEqual([
      { index: 0, of: 3, label: 'src/f0.ts' },
      { index: 1, of: 3, label: 'src/f1.ts' },
      { index: 2, of: 3, label: 'src/f2.ts' },
    ]);
    // The info line stays the same shape in both modes.
    expect(info).toEqual(promptLogPayload(input({ detailChunks: chunks }), 'default').info);
  });

  it('the info line still has no sha256 / preview / order / chunk', () => {
    const keys = allKeys(promptLogPayload(input({ detailChunks: chunks }), 'verbose').info);
    for (const k of FORBIDDEN_DEFAULT_KEYS) expect(keys).not.toContain(k);
  });

  it('detail carries the section order and a sha256 per section', () => {
    const { debug } = promptLogPayload(input(), 'verbose');
    expect(debug).toHaveLength(1);
    const d = debug[0]!;
    expect(d.order).toEqual(['system', 'injection_guard', 'skills', 'diff']);
    for (const s of d.sections as { sha256: string }[]) expect(s.sha256).toMatch(/^[0-9a-f]{12}$/);
  });

  it('AC-7: preview only on the system section', () => {
    const { debug } = promptLogPayload(input(), 'verbose');
    const secs = debug[0]!.sections as { name: string; preview?: string }[];
    expect(secs.filter((s) => 'preview' in s).map((s) => s.name)).toEqual(['system']);
    expect(secs[0]!.preview).toBe('You are the SECURITY agent.');
  });

  it('AC-7: a long system prompt is cut to at most 120 chars plus the mask suffix', () => {
    const long = `${'word '.repeat(100)}END`;
    const { debug } = promptLogPayload(input({ systemPrompt: long }), 'verbose');
    const preview = (debug[0]!.sections as { preview?: string }[])[0]!.preview!;
    expect(preview.length).toBeLessThanOrEqual(120 + '…'.length);
    expect(preview.length).toBeGreaterThan(100);
    expect(preview).not.toContain('END');
  });

  it('AC-7: a secret shape in the system prompt comes out masked', () => {
    const { debug } = promptLogPayload(input({ systemPrompt: `Use token ${GHP} for the API.` }), 'verbose');
    const json = JSON.stringify(debug);
    expect(json).not.toContain(GHP);
    expect(json).toContain('ghp_…[masked]');
  });

  it('AC-7: a secret that straddles the 120-char cut is not leaked in part', () => {
    // 110 chars of padding, then an AWS key (20 chars) that the 120-char cut splits in half.
    const sys = `${'x'.repeat(110)}AKIAIOSFODNN7EXAMPLE and more`;
    const { debug } = promptLogPayload(input({ systemPrompt: sys }), 'verbose');
    const preview = (debug[0]!.sections as { preview?: string }[])[0]!.preview!;
    // Whatever of the key survives the cut, no more than the 4-char head may show.
    expect(preview).not.toContain('AKIAIOSFOD');
  });

  // Preview of a system prompt, as logged. AC-7: "at most 120 chars plus the mask suffix, secret
  // shapes masked". The spec does not say whether the trailing "…" appears when masking alone
  // shortened the prompt, so these tests bound the length and pin the masking only.
  const previewOf = (sys: string) =>
    (promptLogPayload(input({ systemPrompt: sys }), 'verbose').debug[0]!.sections as { preview?: string }[])[0]!
      .preview!;

  it('AC-7: a ghp_ token cut by the 120-char limit shows at most its 4-char head', () => {
    const token = `ghp_${'aB3dE6gH9j'.repeat(4).slice(0, 36)}`;
    for (const pad of [100, 110, 115, 118, 119]) {
      const p = previewOf(`${'x'.repeat(pad)}${token} trailing text`);
      expect(p, `pad ${pad}`).not.toContain('ghp_aB');
      expect(p, `pad ${pad}`).not.toContain(token.slice(4, 14));
      // The 13-char mask fits whole only while pad + 13 <= 120.
      if (pad + 13 <= 120) expect(p, `pad ${pad}`).toContain('ghp_…[masked]');
    }
  });

  it('AC-7: when masking shortens a long prompt to 120 chars or fewer, the preview stays within the bound and is masked', () => {
    const token = `ghp_${'aB3dE6gH9j'.repeat(4).slice(0, 36)}`; // 40 chars -> 13 after masking
    // A space after the token: the token pattern is greedy over [A-Za-z0-9] and would swallow the tail.
    const sys = `${'a'.repeat(80)}${token} ${'b'.repeat(19)}`; // 140 raw, 113 masked
    const p = previewOf(sys);
    expect(p.length).toBeLessThanOrEqual(121);
    expect(p).not.toContain(token.slice(4, 14));
    // Spec AC-7: the preview ends in `…` whenever the flattened prompt is longer than 120 chars,
    // even when masking shortened it below that.
    expect(p).toBe(`${'a'.repeat(80)}ghp_…[masked] ${'b'.repeat(19)}…`);
  });

  it('AC-7: a prompt of 120 chars or fewer has no trailing suffix, with or without a secret', () => {
    const token = `ghp_${'aB3dE6gH9j'.repeat(4).slice(0, 36)}`;
    expect(previewOf('You are a reviewer.')).toBe('You are a reviewer.');
    expect(previewOf('x'.repeat(120))).toBe('x'.repeat(120)); // exactly at the limit
    expect(previewOf(`Use ${token} here`)).toBe('Use ghp_…[masked] here'); // 49 raw chars
    expect(previewOf('x'.repeat(121))).toBe(`${'x'.repeat(120)}…`); // one over: suffix
  });

  it('AC-7: a prompt that is still longer than 120 chars after masking is cut to 120 chars plus one suffix char', () => {
    const token = `ghp_${'aB3dE6gH9j'.repeat(4).slice(0, 36)}`;
    const sys = `${token} ${'w'.repeat(300)}`;
    const p = previewOf(sys);
    expect(p.startsWith('ghp_…[masked] w')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(121);
    expect(p.length).toBeGreaterThan(100);
    expect(p).not.toContain('w'.repeat(121));
  });

  it('no key named diff / body / content / text anywhere in either payload', () => {
    const { info, debug } = promptLogPayload(input({ detailChunks: chunks }), 'verbose');
    const keys = [...allKeys(info), ...allKeys(debug)];
    for (const k of CONTENT_KEYS) expect(keys).not.toContain(k);
    expect(keys).not.toContain('systemPrompt');
  });

  it('without detailChunks there is one detail line for the whole prompt; without a systemPrompt, no preview', () => {
    const { debug } = promptLogPayload(input({ systemPrompt: undefined }), 'verbose');
    expect(debug).toHaveLength(1);
    expect(debug[0]).not.toHaveProperty('chunk');
    expect(allKeys(debug)).not.toContain('preview');
  });
});

describe('logPrompt / logPromptDetail', () => {
  function capture() {
    const lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
    const logger: ChildableLogger = {
      info: (obj, msg) => lines.push({ level: 'info', obj: obj as Record<string, unknown>, msg }),
      warn: (obj, msg) => lines.push({ level: 'warn', obj: obj as Record<string, unknown>, msg }),
      error: (obj, msg) => lines.push({ level: 'error', obj: obj as Record<string, unknown>, msg }),
      debug: (obj, msg) => lines.push({ level: 'debug', obj: obj as Record<string, unknown>, msg }),
    };
    return { lines, logger };
  }

  it('AC-6 default: 1 info "prompt: assembled", 0 debug', () => {
    const { lines, logger } = capture();
    logPrompt(logger, input({ detailChunks: chunks }), 'default');
    expect(lines.map((l) => [l.level, l.msg])).toEqual([['info', 'prompt: assembled']]);
  });

  it('AC-6 verbose: 1 info and 3 debug "prompt: detail" for 3 chunks', () => {
    const { lines, logger } = capture();
    logPrompt(logger, input({ detailChunks: chunks }), 'verbose');
    expect(lines.map((l) => [l.level, l.msg])).toEqual([
      ['info', 'prompt: assembled'],
      ['debug', 'prompt: detail'],
      ['debug', 'prompt: detail'],
      ['debug', 'prompt: detail'],
    ]);
  });

  it('logPromptDetail writes one debug line in verbose mode and nothing in default mode', () => {
    const a = capture();
    logPromptDetail(a.logger, input(), chunks[1]!, 'verbose');
    expect(a.lines.map((l) => [l.level, l.msg])).toEqual([['debug', 'prompt: detail']]);
    expect(a.lines[0]!.obj.chunk).toEqual({ index: 1, of: 3, label: 'src/f1.ts' });
    const b = capture();
    logPromptDetail(b.logger, input(), chunks[1]!, 'default');
    expect(b.lines).toEqual([]);
  });

  it('is a no-op without a logger', () => {
    expect(() => logPrompt(undefined, input(), 'verbose')).not.toThrow();
    expect(() => logPromptDetail(undefined, input(), chunks[0]!, 'verbose')).not.toThrow();
  });
});

describe('childLogger', () => {
  it('on a plain {info,…} object merges the bindings into every logged object', () => {
    const got: { level: string; obj: unknown; msg?: string }[] = [];
    const plain: ChildableLogger = {
      info: (obj, msg) => got.push({ level: 'info', obj, msg }),
      warn: (obj, msg) => got.push({ level: 'warn', obj, msg }),
      error: (obj, msg) => got.push({ level: 'error', obj, msg }),
      debug: (obj, msg) => got.push({ level: 'debug', obj, msg }),
    };
    const child = childLogger(plain, { correlationId: 'c-1', prId: 'p-1' });
    child.info({ a: 1 }, 'one');
    child.debug({ b: 2 }, 'two');
    child.warn({}, 'three');
    child.error({ c: 3 }, 'four');
    expect(got).toEqual([
      { level: 'info', obj: { correlationId: 'c-1', prId: 'p-1', a: 1 }, msg: 'one' },
      { level: 'debug', obj: { correlationId: 'c-1', prId: 'p-1', b: 2 }, msg: 'two' },
      { level: 'warn', obj: { correlationId: 'c-1', prId: 'p-1' }, msg: 'three' },
      { level: 'error', obj: { correlationId: 'c-1', prId: 'p-1', c: 3 }, msg: 'four' },
    ]);
  });

  it('uses the logger\'s own child() when it has one', () => {
    const seen: Record<string, unknown>[] = [];
    const base: ChildableLogger = {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      child: (b) => {
        seen.push(b);
        return { ...base, info: (obj) => seen.push({ viaChild: obj }) };
      },
    };
    const child = childLogger(base, { correlationId: 'c-2' });
    child.info({ x: 1 }, 'm');
    expect(seen).toEqual([{ correlationId: 'c-2' }, { viaChild: { x: 1 } }]);
  });
});
