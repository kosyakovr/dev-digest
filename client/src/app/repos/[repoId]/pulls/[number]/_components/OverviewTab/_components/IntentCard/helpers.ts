import type { IntentSource, IntentSourceKind, IntentUnresolvedReason } from "@devdigest/shared";

/** A source the intent was derived from, as shown in "Sources: …". */
export interface UsedSource {
  kind: "title" | "description" | "ticket" | "spec" | "commits" | "diff";
  ref: string | null;
}

/** A referenced source that could not be used. */
export interface UnresolvedSource {
  kind: IntentSourceKind;
  ref: string | null;
  reason: IntentUnresolvedReason;
}

const ORDER: UsedSource["kind"][] = ["title", "description", "ticket", "spec", "commits", "diff"];

/** `branch` and `files` are folded into `diff` for display. */
const DISPLAY_KIND: Partial<Record<IntentSourceKind, UsedSource["kind"]>> = {
  title: "title",
  description: "description",
  ticket: "ticket",
  spec: "spec",
  commits: "commits",
  diff: "diff",
  branch: "diff",
  files: "diff",
};

/**
 * Used sources in display order (title, description, ticket(s), spec(s),
 * commits, diff). `"diffOnly"` when nothing but the PR's own code and title
 * informed the intent — no description, ticket, spec or commits.
 */
export function sourcesSummary(sources: IntentSource[]): UsedSource[] | "diffOnly" {
  const used = sources.filter((src) => src.status === "used");
  const has = (kind: UsedSource["kind"]) => used.some((u) => DISPLAY_KIND[u.kind] === kind);
  if (!has("description") && !has("ticket") && !has("spec") && !has("commits")) return "diffOnly";

  const out: UsedSource[] = [];
  for (const kind of ORDER) {
    if (kind === "ticket" || kind === "spec") {
      for (const u of used.filter((x) => x.kind === kind)) out.push({ kind, ref: u.ref });
    } else if (has(kind)) {
      out.push({ kind, ref: null });
    }
  }
  return out;
}

export function unresolvedSummary(sources: IntentSource[]): UnresolvedSource[] {
  const out: UnresolvedSource[] = [];
  for (const src of sources) {
    if (src.status === "unresolved" && src.reason) {
      out.push({ kind: src.kind, ref: src.ref, reason: src.reason });
    }
  }
  return out;
}
