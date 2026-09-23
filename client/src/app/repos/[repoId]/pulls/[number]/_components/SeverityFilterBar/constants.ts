/** Constants for SeverityFilterBar. */

/**
 * The severities a run can be filtered by, in display order. INFO is in the UI
 * kit but not in the `Severity` contract, so it is deliberately not offered.
 */
export const FILTERABLE_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/** Severity → filter-button label key, under the `prReview` namespace. */
export const SEVERITY_LABEL_KEY: Record<string, string> = {
  CRITICAL: "panel.severity.critical",
  WARNING: "panel.severity.warning",
  SUGGESTION: "panel.severity.suggestion",
};

/**
 * Severity → counter label key ("{count} CRITICAL").
 *
 * The count and the word live in ONE message rather than two adjacent spans,
 * so the rendered node's text is literally "2 CRITICAL" — greppable, and
 * matchable by a text locator, which "2" + "CRITICAL" in separate elements is
 * not. The word is uppercase in the message, not via textTransform, for the
 * same reason.
 */
export const SEVERITY_COUNT_KEY: Record<string, string> = {
  CRITICAL: "panel.severityCount.critical",
  WARNING: "panel.severityCount.warning",
  SUGGESTION: "panel.severityCount.suggestion",
};
