import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

/**
 * OpenRouterProvider.completeStructured — how it ends when the model's reply is
 * unusable. The OpenAI client is replaced by a stub that replays canned
 * responses; no network.
 */

const Schema = z.object({ intent: z.string(), sources_conflict: z.boolean() });

interface Canned {
  content: string;
  finish_reason: 'stop' | 'length';
  completion_tokens?: number;
  reasoning_tokens?: number;
}

function providerReplaying(replies: Canned[]) {
  const provider = new OpenRouterProvider('test-key');
  const calls: unknown[] = [];
  (provider as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        async create(body: unknown) {
          calls.push(body);
          const r = replies[calls.length - 1];
          if (!r) throw new Error('no more canned replies');
          return {
            choices: [{ message: { content: r.content }, finish_reason: r.finish_reason }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: r.completion_tokens ?? 5,
              completion_tokens_details: { reasoning_tokens: r.reasoning_tokens ?? 0 },
            },
          };
        },
      },
    },
  };
  return { provider, calls };
}

const request = {
  model: 'm',
  schema: Schema,
  schemaName: 'PrIntentClassification',
  maxTokens: 800,
  maxRetries: 1,
  messages: [{ role: 'user' as const, content: 'x' }],
};

describe('OpenRouterProvider.completeStructured', () => {
  it('fails at once, without a reprompt, when the reply was cut off at max_tokens', async () => {
    const { provider, calls } = providerReplaying([
      { content: '', finish_reason: 'length', completion_tokens: 800, reasoning_tokens: 800 },
      { content: '{"intent":"x","sources_conflict":false}', finish_reason: 'stop' },
    ]);

    await expect(provider.completeStructured(request)).rejects.toThrow(
      'OpenRouter output for PrIntentClassification was cut off at max_tokens (800): 800 completion tokens, 800 of them reasoning — raise maxTokens',
    );
    expect(calls).toHaveLength(1);
  });

  it('still accepts a reply flagged as cut off when its JSON is complete', async () => {
    const { provider } = providerReplaying([
      { content: '{"intent":"x","sources_conflict":false}', finish_reason: 'length' },
    ]);

    const res = await provider.completeStructured(request);

    expect(res.data).toEqual({ intent: 'x', sources_conflict: false });
  });

  it('reprompts on a schema mismatch and names the failing field when every attempt fails', async () => {
    const { provider, calls } = providerReplaying([
      { content: '{"intent":"x"}', finish_reason: 'stop' },
      { content: '{"intent":"x"}', finish_reason: 'stop' },
    ]);

    const err = await provider.completeStructured(request).catch((e: Error) => e);

    expect(calls).toHaveLength(2);
    expect((err as Error).message).toMatch(
      /^OpenRouter structured output failed schema validation for PrIntentClassification after 2 attempts: .*sources_conflict/,
    );
  });

  it('returns the reprompted answer when the second attempt matches', async () => {
    const { provider, calls } = providerReplaying([
      { content: '{"intent":"x"}', finish_reason: 'stop' },
      { content: '{"intent":"y","sources_conflict":true}', finish_reason: 'stop' },
    ]);

    const res = await provider.completeStructured(request);

    expect(calls).toHaveLength(2);
    expect(res.data).toEqual({ intent: 'y', sources_conflict: true });
    expect(res.attempts).toBe(2);
  });
});
