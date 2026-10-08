import type { ChatMessage, LLMProvider } from '@devdigest/shared';
import {
  TOUR_DEADLINE_MS,
  TOUR_MAX_RETRIES,
  TOUR_MAX_TOKENS,
  TOUR_TEMPERATURE,
} from './constants.js';
import { TOUR_SCHEMA_NAME, TourAnswerSchema, type TourAnswer } from './prompt.js';

/**
 * L05 onboarding tour — the single model call (ring ②). Receives an
 * `LLMProvider`, never the container. `timeoutMs` is per attempt and ignored on
 * OpenRouter (server/INSIGHTS.md 2026-09-23, 2026-10-02), so the 120 s wall
 * clock is a `Promise.race`; the abandoned request cannot be cancelled.
 */
export type TourCallResult =
  | { kind: 'ok'; answer: TourAnswer; model: string; costUsd: number | null }
  | { kind: 'failed' }
  | { kind: 'timeout' };

const TIMED_OUT = Symbol('timed out');

export async function callTourModel(
  llm: LLMProvider,
  req: { model: string; messages: ChatMessage[] },
  deadlineMs: number = TOUR_DEADLINE_MS,
): Promise<TourCallResult> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), deadlineMs);
  });
  try {
    const call = llm.completeStructured({
      model: req.model,
      schema: TourAnswerSchema,
      schemaName: TOUR_SCHEMA_NAME,
      temperature: TOUR_TEMPERATURE,
      maxTokens: TOUR_MAX_TOKENS,
      timeoutMs: TOUR_DEADLINE_MS,
      maxRetries: TOUR_MAX_RETRIES,
      messages: req.messages,
    });
    // An abandoned call that later rejects must not become an unhandled rejection.
    call.catch(() => undefined);
    const res = await Promise.race([call, deadline]);
    if (res === TIMED_OUT) return { kind: 'timeout' };
    return { kind: 'ok', answer: res.data, model: res.model, costUsd: res.costUsd ?? null };
  } catch {
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
