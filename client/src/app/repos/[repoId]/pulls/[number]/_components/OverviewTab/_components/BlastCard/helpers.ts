/* BlastCard helpers — pure functions (no React, no fetching). */
import type { BlastCaller, BlastRadius } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/** The four header counters — the same formula as the server's `summary`. */
export function blastCounts(blast: BlastRadius): {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
} {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const k of d.crons_affected) crons.add(k);
  }
  return {
    symbols: blast.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/** Links are pinned to the SHA the index was built at; fall back to the PR head. */
export function linkSha(blast: BlastRadius, headSha: string | null | undefined): string | null {
  return blast.indexed_sha ?? headSha ?? null;
}

/** GitHub blob URL of a caller line, or null when the repo or SHA is unknown. */
export function callerHref(
  repoFullName: string | null | undefined,
  sha: string | null | undefined,
  caller: Pick<BlastCaller, "file" | "line">,
): string | null {
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, caller.file, caller.line);
}
