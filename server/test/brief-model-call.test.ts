import { describe, it, expect } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { callBriefModel } from '../src/modules/brief/model-call.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * The single risk-brief model call (plan WP3.tests [T2]; spec NFR-1, NFR-2,
 * NFR-6, A-10): a wall-clock race with an injected deadline, the bounds it sends,
 * and its three outcomes.
 */

const ANSWER = {
  risks: [],
  review_focus: [],
  summary: 'S',
};
const REQ = { model: 'gpt-4.1', messages: [{ role: 'user' as const, content: 'facts' }] };

/** An LLM whose structured call never settles. */
function hangingLlm() {
  const calls: unknown[] = [];
  const llm = {
    id: 'openai',
    completeStructured: (req: unknown) => {
      calls.push(req);
      return new Promise(() => {});
    },
  } as unknown as LLMProvider;
  return { llm, calls };
}

describe('callBriefModel', () => {
  it('NFR-1: a call that never answers ends as {kind:"timeout"} at the injected deadline', async () => {
    const { llm } = hangingLlm();
    const started = Date.now();
    const res = await callBriefModel(llm, REQ, 50);
    const elapsed = Date.now() - started;
    expect(res).toEqual({ kind: 'timeout' });
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2000);
  });

  it('NFR-2 / NFR-6: sends maxTokens 6000, maxRetries 1, the PrRiskBrief schema name and no tools', async () => {
    const { llm, calls } = hangingLlm();
    await callBriefModel(llm, REQ, 20);
    expect(calls).toHaveLength(1);
    const sent = calls[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ maxTokens: 6000, maxRetries: 1, schemaName: 'PrRiskBrief', model: 'gpt-4.1' });
    expect(sent).not.toHaveProperty('tools');
    expect(sent.messages).toEqual(REQ.messages);
  });

  it('a normal answer comes back as ok with the provider\'s model, tokens and cost', async () => {
    const llm = new MockLLMProvider('openai', { structured: ANSWER, costUsd: 0.5 });
    const res = await callBriefModel(llm, REQ, 1000);
    expect(res).toEqual({ kind: 'ok', answer: ANSWER, model: 'gpt-4.1', tokensIn: 100, tokensOut: 50, costUsd: 0.5 });
  });

  it('NFR-8: a null cost stays null', async () => {
    const llm = new MockLLMProvider('openai', { structured: ANSWER, costUsd: null });
    const res = await callBriefModel(llm, REQ, 1000);
    expect(res).toMatchObject({ kind: 'ok', costUsd: null });
  });

  it('AC-17: a throwing call is {kind:"failed", reason:<its message>}', async () => {
    const llm = {
      id: 'openai',
      completeStructured: async () => {
        throw new Error('boom');
      },
    } as unknown as LLMProvider;
    expect(await callBriefModel(llm, REQ, 1000)).toEqual({ kind: 'failed', reason: 'boom' });
  });

  it('a call that answers after the deadline does not change the outcome: it stays a timeout', async () => {
    const llm = {
      id: 'openai',
      completeStructured: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: ANSWER, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 }), 80),
        ),
    } as unknown as LLMProvider;
    expect(await callBriefModel(llm, REQ, 10)).toEqual({ kind: 'timeout' });
  });
});
