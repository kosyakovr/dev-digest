import type { FindingPreviewData } from "./FindingPreview";

/**
 * Format a finding's line range ("11" when single-line, else "11-15").
 *
 * Deliberately a copy of FindingCard's helper rather than an import: that one
 * types on `FindingRecord`, and importing it here would point a shared
 * component at a route's `_components/` folder, inverting the dependency.
 */
export function lineLabel(f: Pick<FindingPreviewData, "start_line" | "end_line">): string {
  return f.end_line == null || f.start_line === f.end_line
    ? `${f.start_line}`
    : `${f.start_line}-${f.end_line}`;
}
