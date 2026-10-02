import { createHash } from 'node:crypto';

/**
 * Content-free description of one prompt section, for logs. Pure computation —
 * no I/O. A section's text is hashed and measured here and never leaves.
 */
export type SectionTrust = 'trusted' | 'untrusted';

export interface PromptSectionMeta {
  name: string;
  source: string;
  ref?: string;
  trust: SectionTrust;
  chars: number;
  tokensEst: number;
  items?: number;
  /** First 12 hex of sha256 over the rendered text. */
  sha256: string;
}

/** Rough token estimate: no tokenizer, `ceil(chars / 4)`. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function describeSection(a: {
  name: string;
  source: string;
  trust: SectionTrust;
  text: string;
  ref?: string;
  items?: number;
}): PromptSectionMeta {
  return {
    name: a.name,
    source: a.source,
    ...(a.ref !== undefined ? { ref: a.ref } : {}),
    trust: a.trust,
    chars: a.text.length,
    tokensEst: estimateTokens(a.text),
    ...(a.items !== undefined ? { items: a.items } : {}),
    sha256: createHash('sha256').update(a.text).digest('hex').slice(0, 12),
  };
}
