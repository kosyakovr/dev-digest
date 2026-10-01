import type { Severity } from "@devdigest/shared";

/** Sort rank of a severity (lower = more severe). */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};
