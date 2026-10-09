/** Pure helpers for the Overview tab's PR Brief. */

import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/**
 * The review whose verdict the PR Brief banner shows: the first review with a
 * verdict, in the order given (newest first). Undefined when none has one.
 */
export function latestVerdictReview(reviews: readonly ReviewRecord[]): ReviewRecord | undefined {
  return reviews.find((r) => r.verdict != null);
}

/** Blockers = CRITICAL findings that were not dismissed. */
export function blockerCount(findings: readonly FindingRecord[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
