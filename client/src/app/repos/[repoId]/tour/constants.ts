/** Constants for the Onboarding Tour page. */

// Type-only: a value import of `@devdigest/shared` makes Next's webpack bundle
// the vendored barrel, whose `./contracts/*.js` specifiers it cannot resolve.
import type { BlastDegradedReason } from "@devdigest/shared";

/** The elapsed counter ticks once a second. */
export const ELAPSED_TICK_MS = 1_000;

/** How long "Copied!" (or the copy failure text) stays on screen. */
export const COPY_FEEDBACK_MS = 2_000;

/** SHAs are shown in their short git form. */
export const SHORT_SHA_LENGTH = 7;

/** `index_reason` values that have a pinned "index unavailable" wording (all but `index_partial`); checked against the contract. */
export const UNAVAILABLE_REASONS = [
  "flag_off",
  "index_failed",
  "repo_too_large",
  "no_data",
] as const satisfies readonly Exclude<BlastDegradedReason, "index_partial">[];
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

/** Message key for each model-side `skeleton_reason`. */
export const SKELETON_REASON_KEYS = {
  llm_unavailable: "notice.llmUnavailable",
  llm_failed: "notice.llmFailed",
  llm_timeout: "notice.llmTimeout",
} as const;
