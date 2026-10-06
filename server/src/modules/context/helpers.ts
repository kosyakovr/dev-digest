import type { SpecFile } from '@devdigest/shared';
import type { ContextItemRow, ReadClass } from './types.js';

/**
 * L05 — pure helpers (ring ②). No I/O, no `await`, no container: deterministic
 * and unit-testable without Fastify or a database.
 */

const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/** The first DIRECTORY segment, from the left, that equals a configured folder name; else null. */
export function sourceOf(path: string, folders: string[]): string | null {
  const dirs = path.split('/').slice(0, -1);
  for (const seg of dirs) if (folders.includes(seg)) return seg;
  return null;
}

/** A listable doc: a lowercase `.md` file under a configured folder. */
export function isDocPath(path: string, folders: string[]): boolean {
  return path.endsWith('.md') && sourceOf(path, folders) !== null;
}

/** An attachment path the API accepts: repo-relative, no traversal, markdown. */
export function isValidAttachmentPath(p: string): boolean {
  if (p.length === 0 || p.startsWith('/') || p.startsWith('-')) return false;
  if (p.includes('\0') || p.includes('\\')) return false;
  if (p.split('/').includes('..')) return false;
  return p.endsWith('.md');
}

/**
 * Collapse repeated paths (the first wins), reject two equal positions, then
 * renumber the positioned items 0..n-1 in ascending order.
 */
export function normalizeItems(
  items: ContextItemRow[],
): { items: ContextItemRow[] } | { error: 'duplicate_position' } {
  const seen = new Set<string>();
  const unique: ContextItemRow[] = [];
  for (const it of items) {
    if (seen.has(it.path)) continue;
    seen.add(it.path);
    unique.push({ path: it.path, position: it.position });
  }
  const positions = new Set<number>();
  for (const it of unique) {
    if (it.position === null) continue;
    if (positions.has(it.position)) return { error: 'duplicate_position' };
    positions.add(it.position);
  }
  const rank = new Map(
    unique
      .filter((i) => i.position !== null)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((it, idx) => [it.path, idx] as const),
  );
  return {
    items: unique.map((it) => ({
      path: it.path,
      position: it.position === null ? null : (rank.get(it.path) as number),
    })),
  };
}

/** Response order: positioned items by position, then the unpositioned by path. */
export function sortForResponse(items: ContextItemRow[]): ContextItemRow[] {
  const positioned = items
    .filter((i) => i.position !== null)
    .sort((a, b) => (a.position as number) - (b.position as number));
  const rest = items.filter((i) => i.position === null).sort(byPath);
  return [...positioned, ...rest];
}

/**
 * Prompt order (A-5): positioned items by position; then unpositioned ones by
 * source name and path; then those with no source (folder no longer configured) by path.
 */
export function runOrder(items: ContextItemRow[], folders: string[]): ContextItemRow[] {
  const positioned = items
    .filter((i) => i.position !== null)
    .sort((a, b) => (a.position as number) - (b.position as number));
  const withSource: { item: ContextItemRow; source: string }[] = [];
  const noSource: ContextItemRow[] = [];
  for (const item of items.filter((i) => i.position === null)) {
    const source = sourceOf(item.path, folders);
    if (source === null) noSource.push(item);
    else withSource.push({ item, source });
  }
  withSource.sort((a, b) =>
    a.source === b.source ? byPath(a.item, b.item) : a.source < b.source ? -1 : 1,
  );
  return [...positioned, ...withSource.map((w) => w.item), ...noSource.sort(byPath)];
}

/** Classify a `readFileAtRef` result against the size cap. */
export function classifyRead(
  read: { text: string; bytes: number } | null,
  max: number,
): ReadClass {
  if (read === null) return 'not_found';
  if (read.bytes > max) return 'too_large';
  if (Buffer.byteLength(read.text) !== read.bytes) return 'unreadable';
  return 'ok';
}

/** Hand-written mapper to the `SpecFile` contract. */
export function toSpecFile(a: {
  path: string;
  source: string | null;
  size: number | null;
  tokens: number | null;
  content?: string | null;
  usedBy?: number | null;
}): SpecFile {
  return {
    path: a.path,
    content: a.content ?? null,
    size: a.size,
    updated_at: null,
    tokens: a.tokens,
    source: a.source,
    used_by: a.usedBy ?? null,
  };
}
