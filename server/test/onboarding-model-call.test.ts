import { describe, it, expect, afterEach, vi } from 'vitest';
import type { LLMProvider, ChatMessage } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { callTourModel } from '../src/modules/onboarding/model-call.js';

/**
 * L05 onboarding tour — the single model call (plan WP3.tests [T2]; AC-16, AC-18,
 * NFR-1, NFR-3, NFR-4). The 120 s limit is wall-clock for the whole call.
 */

const messages: ChatMessage[] = [
  { role: 'system', content: 's' },
  { role: 'user', content: 'u' },
];
const req = { model: 'deepseek/deepseek-v4-flash', messages };

const ANSWER = {
  overview: 'o',
  how_to_run_body: 'h',
  critical_path_notes: [],
  reading_notes: [],
  step_notes: [],
  tasks: [],
};

const asProvider = (completeStructured: unknown) => ({ completeStructured }) as unknown as LLMProvider;

afterEach(() => {
  vi.useRealTimers();
});

describe('callTourModel — deadline (AC-18, NFR-1)', () => {
  it('resolves { kind: "timeout" } once 120,000 ms pass with no answer, and not before', async () => {
    vi.useFakeTimers();
    const llm = asProvider(() => new Promise(() => {}));
    let settled: unknown;
    const call = callTourModel(llm, req).then((r) => (settled = r));

    await vi.advanceTimersByTimeAsync(119_999);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await call;
    expect(settled).toEqual({ kind: 'timeout' });
  });

  it('honours a shorter deadline given as the third argument', async () => {
    vi.useFakeTimers();
    const llm = asProvider(() => new Promise(() => {}));
    const call = callTourModel(llm, req, 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(call).resolves.toEqual({ kind: 'timeout' });
  });

  it('leaves no timer behind after an answer', async () => {
    vi.useFakeTimers();
    const llm = new MockLLMProvider('openai', { structured: ANSWER });
    await callTourModel(llm, req);
    expect(vi.getTimerCount()).toBe(0);
  });

});

describe('callTourModel — outcomes and request (NFR-3, NFR-4, AC-16)', () => {
  it('returns the parsed answer with the model and the provider cost, and sends one capped request', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { OnboardingTour: ANSWER } });

    const res = await callTourModel(llm, req);

    expect(res).toEqual({ kind: 'ok', answer: ANSWER, model: req.model, costUsd: 0.001 });
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.req).toMatchObject({
      model: req.model,
      maxTokens: 6000,
      maxRetries: 1,
      timeoutMs: 120_000,
      schemaName: 'OnboardingTour',
      messages,
    });
  });

  it('reports an unknown cost as null, never 0 (NFR-4)', async () => {
    const llm = asProvider(async () => ({ data: ANSWER, model: 'm', costUsd: null }));
    const res = await callTourModel(llm, req);
    expect(res).toMatchObject({ kind: 'ok', costUsd: null });
  });

  it('returns { kind: "failed" } when the provider throws', async () => {
    const llm = asProvider(async () => {
      throw new Error('provider down');
    });
    await expect(callTourModel(llm, req)).resolves.toEqual({ kind: 'failed' });
  });

  it('returns { kind: "failed" } when the answer does not fit the schema', async () => {
    // The mock validates its fixture against the request schema and throws on a mismatch.
    const llm = new MockLLMProvider('openai', { structuredBySchema: { OnboardingTour: { overview: 1 } } });
    await expect(callTourModel(llm, req)).resolves.toEqual({ kind: 'failed' });
  });
});
