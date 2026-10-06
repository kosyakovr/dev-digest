/* Pure helpers for the Context tabs: the section layout and the ordering
   rules (spec A-23…A-25). A draft is the list of attached paths; a path with
   a position belongs to the "manual block", the rest keep their source group. */
import type { ContextItem, SpecFile } from "@devdigest/shared";
import { blockPaths, buildSections } from "@/lib/context-sections";
import type { Draft, Sections } from "@/lib/context-sections";

export { blockPaths, buildSections };
export type { Draft, DocRow, Sections } from "@/lib/context-sections";

/** Rebuild a draft from an ordered block; every other attached item has no position. */
function withBlock(draft: Draft, block: string[]): Draft {
  const inBlock = new Set(block);
  const rest = draft.filter((i) => !inBlock.has(i.path)).map((i) => ({ path: i.path, position: null }));
  return [...block.map((path, position) => ({ path, position })), ...rest];
}

/** Close gaps in the block so positions run 0..n-1. */
export function renumber(draft: Draft): Draft {
  return withBlock(draft, blockPaths(draft));
}

/** Every visible path in display order. */
export function flatOrder(sections: Sections): string[] {
  return [
    ...sections.manual.map((r) => r.path),
    ...sections.groups.flatMap((g) => g.rows.map((r) => r.path)),
    ...sections.notFound.map((r) => r.path),
  ];
}

export function toggle(draft: Draft, path: string): Draft {
  const next = draft.some((i) => i.path === path)
    ? draft.filter((i) => i.path !== path)
    : [...draft, { path, position: null }];
  return renumber(next);
}

const isAttached = (draft: Draft, path: string) => draft.some((i) => i.path === path);

/** Drop `dragPath` on `targetPath`; `order` is the flat display order. */
export function dropOn(draft: Draft, order: string[], dragPath: string, targetPath: string): Draft {
  if (dragPath === targetPath || !isAttached(draft, dragPath)) return draft;
  const block = blockPaths(draft);
  const without = block.filter((p) => p !== dragPath);
  if (block.includes(targetPath)) {
    const at = without.indexOf(targetPath);
    return withBlock(draft, [...without.slice(0, at), dragPath, ...without.slice(at)]);
  }
  // The first row after the block (or of the list, when the block is empty).
  if (order[block.length] === targetPath) return withBlock(draft, [...without, dragPath]);
  return withBlock(draft, without);
}

export function canMoveUp(draft: Draft, path: string): boolean {
  if (!isAttached(draft, path)) return false;
  return blockPaths(draft).indexOf(path) !== 0;
}

export function canMoveDown(draft: Draft, path: string): boolean {
  return blockPaths(draft).includes(path);
}

export function moveUp(draft: Draft, path: string): Draft {
  if (!canMoveUp(draft, path)) return draft;
  const block = blockPaths(draft);
  const i = block.indexOf(path);
  if (i === -1) return withBlock(draft, [...block, path]);
  [block[i - 1], block[i]] = [block[i]!, block[i - 1]!];
  return withBlock(draft, block);
}

export function moveDown(draft: Draft, path: string): Draft {
  const block = blockPaths(draft);
  const i = block.indexOf(path);
  if (i === -1) return draft;
  if (i === block.length - 1) return withBlock(draft, block.slice(0, -1));
  [block[i], block[i + 1]] = [block[i + 1]!, block[i]!];
  return withBlock(draft, block);
}

/** Distinct inherited paths and the tokens they add. */
export function inheritedSummary(
  inherited: { items: ContextItem[] }[],
  docs: SpecFile[] | null,
): { count: number; tokens: number; paths: Set<string> } {
  const paths = new Set(inherited.flatMap((s) => s.items.map((i) => i.path)));
  const tokenOf = new Map((docs ?? []).map((d) => [d.path, d.tokens ?? 0]));
  let tokens = 0;
  for (const p of paths) tokens += tokenOf.get(p) ?? 0;
  return { count: paths.size, tokens, paths };
}

/** Own attached tokens plus the tokens of inherited paths not attached directly (R-14). */
export function total(draft: Draft, docs: SpecFile[] | null, inherited: { items: ContextItem[] }[]): number {
  const tokenOf = new Map((docs ?? []).map((d) => [d.path, d.tokens ?? 0]));
  const own = new Set(draft.map((i) => i.path));
  let sum = 0;
  for (const p of own) sum += tokenOf.get(p) ?? 0;
  for (const p of inheritedSummary(inherited, docs).paths) if (!own.has(p)) sum += tokenOf.get(p) ?? 0;
  return sum;
}

/** The PUT body: every attached path with its renumbered position or null. */
export function toPayload(draft: Draft): ContextItem[] {
  return renumber(draft);
}
