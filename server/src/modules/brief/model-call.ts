import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import {
  BRIEF_DEADLINE_MS,
  BRIEF_MAX_RETRIES,
  BRIEF_MAX_TOKENS,
  BRIEF_TEMPERATURE,
} from './constants.js';
import { BRIEF_SCHEMA_NAME, BriefAnswerSchema, type BriefAnswer } from './prompt.js';

/**
 * L05 risk brief — the single model call (ring ②). Receives an `LLMProvider`,
 * never the container. `timeoutMs` is per attempt and ignored on OpenRouter
 * (server/INSIGHTS.md 2026-09-23, 2026-10-02), so the wall clock is a
 * `Promise.race`; the abandoned request cannot be cancelled.
 */
export type BriefCallResult =
  | {
      kind: 'ok';
      answer: BriefAnswer;
      model: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
    }
  | { kind: 'failed'; reason: string }
  | { kind: 'timeout' };

const TIMED_OUT = Symbol('timed out');

export async function callBriefModel(
  llm: LLMProvider,
  req: { model: string; messages: ChatMessage[] },
  deadlineMs: number = BRIEF_DEADLINE_MS,
): Promise<BriefCallResult> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), deadlineMs);
  });
  try {
    const call = llm.completeStructured({
      model: req.model,
      schema: BriefAnswerSchema,
      schemaName: BRIEF_SCHEMA_NAME,
      temperature: BRIEF_TEMPERATURE,
      maxTokens: BRIEF_MAX_TOKENS,
      timeoutMs: BRIEF_DEADLINE_MS,
      maxRetries: BRIEF_MAX_RETRIES,
      messages: req.messages,
    });
    // An abandoned call that later rejects must not become an unhandled rejection.
    call.catch(() => undefined);
    const res = await Promise.race([call, deadline]);
    if (res === TIMED_OUT) return { kind: 'timeout' };
    return {
      kind: 'ok',
      answer: res.data,
      model: res.model,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd ?? null,
    };
  } catch (err) {
    return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
