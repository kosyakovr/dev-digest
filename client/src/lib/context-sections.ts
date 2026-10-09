/* Source-grouping of repo docs against a draft of attached paths — shared by the
   Project Context page and the agent/skill Context editors (spec A-23…A-25).
   A path with a position belongs to the "manual block", the rest keep their
   source group. */
import type { ContextItem, SpecFile } from "@devdigest/shared";

export type Draft = ContextItem[];

export interface DocRow {
  path: string;
  /** The listed doc, or null when it is not in the repo list. */
  doc: SpecFile | null;
  attached: boolean;
}

export interface Sections {
  manual: DocRow[];
  groups: { source: string; rows: DocRow[] }[];
  notFound: DocRow[];
}

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Positioned paths, ascending by position. */
export function blockPaths(draft: Draft): string[] {
  return draft
    .filter((i) => i.position != null)
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((i) => i.path);
}

export function buildSections(docs: SpecFile[] | null, draft: Draft, filter: string): Sections {
  const q = filter.trim().toLowerCase();
  const match = (path: string) => q === "" || path.toLowerCase().includes(q);
  const listed = new Map((docs ?? []).map((d) => [d.path, d]));
  const attached = new Map(draft.map((i) => [i.path, i]));
  const row = (path: string): DocRow => ({ path, doc: listed.get(path) ?? null, attached: attached.has(path) });

  const manual = blockPaths(draft).filter(match).map(row);
  const groupMap = new Map<string, DocRow[]>();
  for (const d of docs ?? []) {
    const item = attached.get(d.path);
    if ((item && item.position != null) || !match(d.path)) continue;
    const source = d.source ?? "";
    groupMap.set(source, [...(groupMap.get(source) ?? []), row(d.path)]);
  }
  const groups = [...groupMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([source, rows]) => ({ source, rows: rows.sort(byPath) }));
  const notFound = draft
    .filter((i) => i.position == null && !listed.has(i.path) && match(i.path))
    .sort(byPath)
    .map((i) => row(i.path));
  return { manual, groups, notFound };
}
