import type { IntentSource, RepoRef, UnifiedDiff } from '@devdigest/shared';
import type { ReviewIntent } from '@devdigest/reviewer-core';
import type { PullRow } from '../../db/rows.js';
import type { RunLogger } from '../../platform/run-logger.js';

/**
 * L03 — intent module types (ring ②). `PrIntentFacade` is the one thing other
 * modules see: the review executor reaches it through `container.intent`, never
 * by importing this folder.
 */

/** pino-compatible logger; same shape as the one in `reviews/run-executor.ts` (not imported from there). */
export type IntentLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  child?: (bindings: Record<string, unknown>) => IntentLogger;
};

export interface PrIntentFacade {
  /**
   * Intent for a review batch: reuse the stored row when its input hash still
   * matches, else derive once. NEVER throws — any failure or timeout returns
   * `undefined` (and logs why) so the review runs without the slot.
   */
  resolveForReview(a: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRef;
    diff: UnifiedDiff;
    runLog: RunLogger;
    logger?: IntentLogger;
  }): Promise<ReviewIntent | undefined>;
}

/** Everything the classifier is shown (all of it untrusted). */
export interface IntentBundle {
  title: string;
  /** Description with HTML comments removed, capped. Empty string when absent. */
  body: string;
  branch: string;
  commits: string[];
  tickets: { n: number; title: string; body: string }[];
  specs: { path: string; text: string }[];
  /** `path (+a/-d)` lines. Not part of the input hash (the head SHA pins it). */
  files: string[];
  /** First chars of the diff. Not part of the input hash. */
  diffExcerpt: string;
}

/** What the sources actually contained; confidence is computed from these. */
export interface SourceFlags {
  ticket: boolean;
  spec: boolean;
  substantiveBody: boolean;
}

export interface GatheredSources {
  bundle: IntentBundle;
  sources: IntentSource[];
  flags: SourceFlags;
}

/** The minimum of a PR that source gathering needs. */
export interface GatherPull {
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface GatherInput {
  repo: RepoRef;
  pull: GatherPull;
  commits: { message: string }[];
  files: { path: string; additions: number; deletions: number }[];
  diffText: string;
}
