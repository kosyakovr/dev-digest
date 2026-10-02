/**
 * Blast module — pure functions only (ring ②): no I/O, no DB, no ports.
 * Maps the repo-intel facade's `BlastResult` onto the `BlastRadius` wire
 * contract and holds the prior-PR text heuristics.
 */
import type { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';
import { HISTORY_NOTES_MAX_CHARS } from './constants.js';

const byCallerOrder = (a: BlastCallerRow, b: BlastCallerRow): number =>
  a.depth - b.depth ||
  b.rank - a.rank ||
  a.file.localeCompare(b.file) ||
  a.line - b.line;

/** BlastResult → BlastRadius: groups by changed symbol, hand-mapped field by field. */
export function toBlastRadius(result: BlastResult): BlastRadius {
  // Files declaring each changed-symbol name — a caller living there is the
  // symbol's own file, not a downstream impact.
  const declFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const set = declFiles.get(s.name) ?? new Set<string>();
    set.add(s.file);
    declFiles.set(s.name, set);
  }

  const groups = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    const arr = groups.get(c.viaSymbol);
    if (arr) arr.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  const facts = result.factsByFile ?? {};
  const entries = [...groups.entries()].map(([symbol, rows]) => {
    rows.sort(byCallerOrder);
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const r of rows) {
      for (const e of facts[r.file]?.endpoints ?? []) endpoints.add(e);
      for (const k of facts[r.file]?.crons ?? []) crons.add(k);
    }
    const impact: DownstreamImpact = {
      symbol,
      callers: rows.map((r) => ({
        name: r.symbol,
        file: r.file,
        line: r.line,
        depth: r.depth,
        ...(r.depth >= 2 && r.through ? { through: r.through } : {}),
      })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
    return { impact, maxRank: Math.max(...rows.map((r) => r.rank)) };
  });
  entries.sort(
    (a, b) =>
      b.maxRank - a.maxRank ||
      b.impact.callers.length - a.impact.callers.length ||
      a.impact.symbol.localeCompare(b.impact.symbol),
  );
  const downstream = entries.map((e) => e.impact);

  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));
  const radius: BlastRadius = { changed_symbols, downstream, summary: '' };
  const counts = blastCounts(radius);
  radius.summary = `${counts.symbols} symbol(s) → ${counts.callers} caller(s) · ${counts.endpoints} endpoint(s) · ${counts.crons} cron(s)`;
  if (result.degraded !== undefined) radius.degraded = result.degraded;
  if (result.reason) radius.reason = result.reason;
  if (result.indexedSha) radius.indexed_sha = result.indexedSha;
  return radius;
}

/** The four summary counters; endpoints/crons are unique across all groups. */
export function blastCounts(radius: BlastRadius): {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
} {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of radius.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const k of d.crons_affected) crons.add(k);
  }
  return {
    symbols: radius.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/**
 * PR numbers named in a commit message's FIRST line only: a merge commit
 * (`Merge pull request #N`) or a squash suffix (`(#N)`). A bare `#N` in prose
 * is not a PR reference.
 */
export function prNumbersFromMessage(message: string): number[] {
  const first = message.split('\n', 1)[0] ?? '';
  const merge = /^Merge pull request #(\d+)\b/.exec(first);
  if (merge) return [Number(merge[1])];
  const squash = /\(#(\d+)\)\s*$/.exec(first);
  return squash ? [Number(squash[1])] : [];
}

/**
 * First meaningful line of a PR description, as plain text. Strips HTML
 * comments, skips blank lines / ATX headings / rules, removes LEADING block
 * markers per line plus `**` and backticks — never `_`, `>` or `#` globally
 * (they appear in code-shaped text: `sk_live_`, `a > b`, `#482`).
 */
export function notesFromBody(body: string | null): string {
  if (!body) return '';
  const text = body.replace(/<!--[\s\S]*?-->/g, '');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s+\S/.test(line)) continue;
    if (/^[-*_\s]+$/.test(line)) continue;
    const cleaned = line
      .replace(/^\s*(?:>\s*|[-+*]\s+|\d+\.\s+|\[[ xX]\]\s+)/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim();
    if (!cleaned) continue;
    return cleaned.length > HISTORY_NOTES_MAX_CHARS
      ? `${cleaned.slice(0, HISTORY_NOTES_MAX_CHARS - 1)}…`
      : cleaned;
  }
  return '';
}
