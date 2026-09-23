import type { Skill } from "@devdigest/shared";
import { TYPE_COLOR_FALLBACK, TYPE_COLORS } from "./constants";

/** Pure helpers for the Skills feature. No I/O, no React. */

/** Chip colour for a skill type, neutral for a user-authored one. */
export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? TYPE_COLOR_FALLBACK;
}

/** Case-insensitive filter over name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q),
  );
}

/** True when a file looks like Markdown (the only import format we accept). */
export function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

export type DiffOp = "same" | "added" | "removed";

export interface DiffRow {
  op: DiffOp;
  text: string;
}

/**
 * Line diff between two versions of a skill body.
 *
 * A hand-rolled LCS: no diff library is installed and dependencies are locked.
 * Bodies are skill-sized (tens to hundreds of lines), so the O(n·m) table is
 * fine — but it is quadratic in MEMORY too, so very large inputs fall back to a
 * whole-block replace rather than allocating a huge matrix.
 */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length * b.length > MAX_LCS_CELLS) {
    return [
      ...a.map((text) => ({ op: "removed" as const, text })),
      ...b.map((text) => ({ op: "added" as const, text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ op: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ op: "removed", text: a[i]! });
      i++;
    } else {
      rows.push({ op: "added", text: b[j]! });
      j++;
    }
  }
  while (i < a.length) rows.push({ op: "removed", text: a[i++]! });
  while (j < b.length) rows.push({ op: "added", text: b[j++]! });
  return rows;
}

/** Guard on the LCS table size (~1M cells ≈ 1000×1000 lines). */
const MAX_LCS_CELLS = 1_000_000;

/** Added/removed line counts for a diff summary. */
export function diffStat(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((r) => r.op === "added").length,
    removed: rows.filter((r) => r.op === "removed").length,
  };
}
