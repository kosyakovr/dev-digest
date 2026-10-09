/** Pure helpers for the PR detail page's URL state. */

/** The query string that opens Files changed on a file (and a line, when given). */
export function withDiffTarget(search: string, file: string, line: number | null): string {
  const sp = new URLSearchParams(search);
  sp.set("tab", "diff");
  sp.set("file", file);
  if (line != null) sp.set("line", String(line));
  else sp.delete("line");
  return sp.toString();
}

/**
 * The deep-link target in the query, or null without a `file`. A `line` that is
 * not a positive integer is ignored (the file still opens).
 */
export function readDiffTarget(search: string): { file: string; line: number | null } | null {
  const sp = new URLSearchParams(search);
  const file = sp.get("file");
  if (!file) return null;
  const raw = sp.get("line");
  const n = raw != null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return { file, line: Number.isInteger(n) && n > 0 ? n : null };
}
