import type { IntentSource, PrIntentResponse, RepoRef, UnifiedDiff } from '@devdigest/shared';
import type { ReviewIntent } from '@devdigest/reviewer-core';
import type { PullRow } from '../../db/rows.js';
import type { RunLogger } from '../../platform/run-logger.js';
import type { ChildableLogger } from '../../platform/prompt-log.js';

/**
 * L03 — intent module types (ring ②). `PrIntentFacade` is the one thing other
 * modules see: the review executor reaches it through `container.intent`, never
 * by importing this folder.
 */

/** pino-compatible logger; the shared platform shape. */
export type IntentLogger = ChildableLogger;

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

  /** The stored intent (never calls the model). `stale` = the PR head moved since. */
  get(workspaceId: string, prId: string): Promise<PrIntentResponse>;

  /** Derive now, ignoring the cache. Throws 422 (no key) or 502 (model failed). */
  derive(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntentResponse>;
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
