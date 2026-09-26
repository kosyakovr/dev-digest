import type { SkillVersion } from "@devdigest/shared";

/** Pure helpers for the Versions tab. */

/** The sign shown in the diff gutter for each op. */
export const DIFF_SIGN = { added: "+", removed: "-", same: " " } as const;

/**
 * The version immediately below `version` in history — what a diff compares
 * against. Undefined for the oldest version, which has no predecessor.
 *
 * Takes the list as given (the API returns it newest-first) and does not assume
 * version numbers are contiguous: a restore deletes newer rows, so after
 * restoring v1 and editing twice the numbers are 1,2,3 again — but a future
 * change to that rule must not silently produce `version - 1` lookups that miss.
 */
export function previousVersion(
  versions: SkillVersion[],
  version: number,
): SkillVersion | undefined {
  return versions
    .filter((v) => v.version < version)
    .sort((a, b) => b.version - a.version)[0];
}
