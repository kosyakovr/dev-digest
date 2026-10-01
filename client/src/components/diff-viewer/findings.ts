/* diff-viewer — findings layer: the contract the host passes in, plus the pure
   helpers that order findings and anchor them to rendered diff lines. */
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { SEVERITY_RANK } from "@/lib/severity";
import type { Line } from "./helpers";

/** Findings of the latest review + the accept/dismiss action, supplied by the host. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  /** Finding whose action is in flight (its buttons are disabled). */
  pendingId: string | null;
  onAction: (findingId: string, action: FindingActionKind) => void;
}

/** Anchor key of a finding — only the new (RIGHT) side of the diff is anchored. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string {
  return `RIGHT:${f.start_line}`;
}

/** Findings anchored to a parsed line — new-side lines only (deleted/hunk lines → []). */
export function findingsForLine(
  ln: Line,
  matched: Map<string, FindingRecord[]>,
): FindingRecord[] {
  if (ln.kind === "del" || ln.kind === "hunk") return [];
  return matched.get(findingKey({ start_line: ln.newNo as number })) ?? [];
}

/** Severity (CRITICAL first), then start_line, end_line, id — all ascending. */
export function sortFindings(list: FindingRecord[]): FindingRecord[] {
  return [...list].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.start_line - b.start_line ||
      a.end_line - b.end_line ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The most severe severity in a non-empty list. */
export function worstSeverity(list: FindingRecord[]): Severity {
  return list.reduce<Severity>(
    (worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
    list[0]!.severity,
  );
}

/** Split a file's findings into those anchored to a rendered line and the rest. */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; outside: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outside: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingKey(f);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outside.push(f);
    }
  }
  for (const [key, list] of matched) matched.set(key, sortFindings(list));
  return { matched, outside: sortFindings(outside) };
}
