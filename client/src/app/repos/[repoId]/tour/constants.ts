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

export type UnavailableReason = Exclude<BlastDegradedReason, "index_partial">;

/**
 * `index_reason` values that have a pinned "index unavailable" wording (all but
 * `index_partial`). Keyed by the contract's union, so a reason added to or renamed
 * in the contract is a compile error here until it gets a wording.
 */
const UNAVAILABLE_REASON_KEYS = {
  flag_off: true,
  index_failed: true,
  repo_too_large: true,
  no_data: true,
} as const satisfies Record<UnavailableReason, true>;
export const UNAVAILABLE_REASONS = Object.keys(UNAVAILABLE_REASON_KEYS) as UnavailableReason[];

/** Message key for each model-side `skeleton_reason`. */
export const SKELETON_REASON_KEYS = {
  llm_unavailable: "notice.llmUnavailable",
  llm_failed: "notice.llmFailed",
  llm_timeout: "notice.llmTimeout",
} as const;
