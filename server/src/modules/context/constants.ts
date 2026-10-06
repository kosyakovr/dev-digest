/**
 * L05 — Project Context literals (ring ②). One place, so the numbers in the
 * spec and the code cannot drift.
 */

/** Raw blob size limit for a project doc (bytes). Larger → `too_large`. Equal to intent's MAX_SPEC_BYTES (A-7). */
export const MAX_CONTEXT_DOC_BYTES = 200_000;

/** How many docs the list route reads from git at once. */
export const READ_CONCURRENCY = 8;
