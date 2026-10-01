import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_RANK } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

/**
 * Tally findings by severity — a plain count over data already in memory. The
 * caller passes the list it is about to RENDER, so each counter always equals
 * the number of cards visible beneath it.
 */
export function countBySeverity(findings: FindingRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

/** Narrow to one severity. `null` means "no severity filter" — the full list. */
export function filterBySeverity(
  findings: FindingRecord[],
  severity: string | null,
): FindingRecord[] {
  return severity == null ? findings : findings.filter((f) => f.severity === severity);
}
