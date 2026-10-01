import type { PromptSectionMeta } from '@devdigest/reviewer-core';
import { maskSecrets } from './secret-mask.js';

/**
 * Prompt-assembly logging helpers (cross-cutting, pure apart from the logger
 * call). The input type carries section METADATA only; the single content field,
 * `systemPrompt`, exists for the masked preview and is never logged whole.
 * Never use `diff`, `body`, `content`, `text` or `systemPrompt` as a logged key:
 * they are pino redact paths.
 */

export type PromptLogMode = 'default' | 'verbose';

/** pino-compatible logger; `child` is optional so plain test doubles still fit. */
export type ChildableLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  child?: (bindings: Record<string, unknown>) => ChildableLogger;
};

/** `logger.child(bindings)` when available, else a wrapper merging bindings into each object. */
export function childLogger<L extends ChildableLogger>(logger: L, bindings: Record<string, unknown>): L {
  if (typeof logger.child === 'function') return logger.child(bindings) as L;
  const wrap =
    (level: 'info' | 'warn' | 'error' | 'debug') =>
    (obj: unknown, msg?: string) =>
      logger[level]({ ...bindings, ...(obj && typeof obj === 'object' ? (obj as object) : {}) }, msg);
  return {
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    debug: wrap('debug'),
  } as L;
}

export interface PromptLogInput {
  kind: 'review' | 'intent';
  provider: string;
  model: string;
  /** Review only. */
  strategy?: string;
  chunks?: number;
  /** Intent only. */
  trigger?: string;
  /** Whole-prompt sections (review: whole-diff sections). */
  sections: PromptSectionMeta[];
  totalChars: number;
  /** Used ONLY to build the masked preview of the system section. */
  systemPrompt?: string;
  /** Verbose detail for chunks; omitted → one detail for the whole prompt. */
  detailChunks?: { index: number; of: number; label: string; sections: PromptSectionMeta[] }[];
}

const PREVIEW_CHARS = 120;

function preview(systemPrompt: string): string {
  // Mask BEFORE cutting: a secret split by the cut no longer matches its pattern.
  // `…` marks a preview that is not the whole prompt: judged on the flattened
  // prompt BEFORE masking, so masking that shortens it below the cut keeps the mark.
  const flat = systemPrompt.replace(/\s+/g, ' ').trim();
  const masked = maskSecrets(flat);
  const cut = flat.length > PREVIEW_CHARS || masked.length > PREVIEW_CHARS;
  return masked.slice(0, PREVIEW_CHARS) + (cut ? '…' : '');
}

/** The default-mode section shape: no hash, no preview. */
function plain(s: PromptSectionMeta) {
  return {
    name: s.name,
    source: s.source,
    ...(s.ref !== undefined ? { ref: s.ref } : {}),
    trust: s.trust,
    chars: s.chars,
    tokensEst: s.tokensEst,
    ...(s.items !== undefined ? { items: s.items } : {}),
  };
}

export function promptLogPayload(
  input: PromptLogInput,
  mode: PromptLogMode,
): { info: Record<string, unknown>; debug: Record<string, unknown>[] } {
  const info: Record<string, unknown> = {
    kind: input.kind,
    provider: input.provider,
    model: input.model,
    ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
    ...(input.chunks !== undefined ? { chunks: input.chunks } : {}),
    ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
    totalChars: input.totalChars,
    totalTokensEst: Math.ceil(input.totalChars / 4),
    sections: input.sections.map(plain),
  };
  if (mode !== 'verbose') return { info, debug: [] };

  const detail = (
    sections: PromptSectionMeta[],
    chunk?: { index: number; of: number; label: string },
  ): Record<string, unknown> => ({
    kind: input.kind,
    ...(chunk ? { chunk } : {}),
    order: sections.map((s) => s.name),
    sections: sections.map((s) => ({
      ...plain(s),
      sha256: s.sha256,
      ...(s.name === 'system' && input.systemPrompt !== undefined
        ? { preview: preview(input.systemPrompt) }
        : {}),
    })),
  });
  const debug = input.detailChunks
    ? input.detailChunks.map((c) => detail(c.sections, { index: c.index, of: c.of, label: c.label }))
    : [detail(input.sections)];
  return { info, debug };
}

/** `prompt: assembled` (info) and, when verbose, `prompt: detail` (debug) per chunk. */
export function logPrompt(logger: ChildableLogger | undefined, input: PromptLogInput, mode: PromptLogMode): void {
  if (!logger) return;
  const { info, debug } = promptLogPayload(input, mode);
  logger.info(info, 'prompt: assembled');
  for (const d of debug) logger.debug(d, 'prompt: detail');
}

/** Verbose-only `prompt: detail` for one later chunk (the info line was already written for chunk 0). */
export function logPromptDetail(
  logger: ChildableLogger | undefined,
  input: PromptLogInput,
  chunk: { index: number; of: number; label: string; sections: PromptSectionMeta[] },
  mode: PromptLogMode,
): void {
  if (!logger || mode !== 'verbose') return;
  for (const d of promptLogPayload({ ...input, detailChunks: [chunk] }, mode).debug) {
    logger.debug(d, 'prompt: detail');
  }
}
