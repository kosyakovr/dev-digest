import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";

export interface PlannedGroup {
  role: SmartDiffRole;
  files: PrFile[];
  /** Files in this group with at least one finding line (NOT the finding count). */
  filesWithFindings: number;
}

/**
 * Join the server's grouping with the PR's files (which carry the patches).
 * Returns null when the two path sets differ (e.g. `pr_files` was re-synced
 * between the two requests) — the caller then falls back to the flat list.
 */
export function planGroups(smart: SmartDiffResponse, files: PrFile[]): PlannedGroup[] | null {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const smartPaths = smart.groups.flatMap((g) => g.files.map((f) => f.path));
  if (smartPaths.length !== byPath.size || new Set(smartPaths).size !== smartPaths.length) return null;
  if (!smartPaths.every((p) => byPath.has(p))) return null;

  return smart.groups.map((g) => ({
    role: g.role,
    files: g.files.map((f) => byPath.get(f.path)!),
    filesWithFindings: g.files.filter((f) => f.finding_lines.length > 0).length,
  }));
}

/** Findings of the reviews the smart-diff was built from, minus dismissed ones. */
export function visibleFindings(
  reviews: ReviewRecord[] | undefined,
  reviewIds: string[],
): FindingRecord[] {
  const ids = new Set(reviewIds);
  return (reviews ?? [])
    .filter((r) => ids.has(r.id))
    .flatMap((r) => r.findings)
    .filter((f) => !f.dismissed_at);
}
