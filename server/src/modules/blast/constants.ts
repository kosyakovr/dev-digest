/**
 * Blast module literals. Blast-radius limits (callers per symbol, BFS depth)
 * live ONLY in `repo-intel/constants.ts` and are applied by the facade; the
 * ceilings here bound the prior-PR history's GitHub traffic.
 */

/** Changed files whose history is read (largest diffs first). */
export const MAX_HISTORY_FILES = 20;
/** Prior PRs returned (and `getPullSummary` calls made) per request. */
export const MAX_HISTORY_PRS = 10;
/** Commits read per file from `commits?path=` (one page). */
export const HISTORY_COMMITS_PER_FILE = 30;
/** `PrHistoryItem.notes` is truncated to this many characters. */
export const HISTORY_NOTES_MAX_CHARS = 200;
