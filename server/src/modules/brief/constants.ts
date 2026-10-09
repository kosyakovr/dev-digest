/**
 * L05 risk brief — literals (ring ①, no logic). Every number, name and message
 * the module compares against or shows lives here so a change is one edit.
 */

/** Wall-clock budget for the whole model call (NFR-1). */
export const BRIEF_DEADLINE_MS = 120_000;
export const BRIEF_MAX_TOKENS = 6_000;
/** `maxRetries` 1 = at most 2 attempts. */
export const BRIEF_MAX_RETRIES = 1;
export const BRIEF_TEMPERATURE = 0;

// ---- Prompt budgets (NFR-3, NFR-4) ----
/** `JSON.stringify(payload).length` of the untrusted facts block. */
export const MAX_FACTS_CHARS = 45_000;
export const MAX_DOCS = 3;
export const MAX_DOC_CHARS = 8_000;
export const MAX_DOCS_TOTAL_CHARS = 16_000;
/** A path list is cut at this many paths OR this many summed path characters. */
export const MAX_LIST_PATHS = 100;
export const MAX_LIST_CHARS = 4_000;
export const MAX_HISTORY_ITEMS = 10;

// ---- Answer clamps (A-9) ----
export const MAX_SUMMARY_CHARS = 600;
export const MAX_RISKS = 6;
export const MAX_FOCUS = 6;
export const MAX_TITLE_CHARS = 160;
export const MAX_REASON_CHARS = 160;
export const MAX_EXPLANATION_CHARS = 600;
export const MAX_FILE_REFS = 6;

/** Roles whose patches go into the prompt, in the order they are given budget. */
export const DIFF_ROLE_ORDER = ['core', 'tests', 'wiring', 'docs'] as const;

// ---- Errors ----
export const BRIEF_IN_PROGRESS_CODE = 'brief_in_progress';
export const BRIEF_IN_PROGRESS_MESSAGE = 'A brief is already being generated for this pull request.';
export const NO_FILES_MESSAGE = 'This pull request has no changed files to brief yet.';
export const PULL_NOT_FOUND_MESSAGE = 'Pull request not found';
export const REPO_NOT_FOUND_MESSAGE = 'Repository not found';
export const BRIEF_FAILED_PREFIX = 'Brief generation failed: ';
export const BRIEF_TIMEOUT_MESSAGE = 'Brief generation failed: timed out after 120 s';
export const BRIEF_EMPTY_SUMMARY_MESSAGE =
  'Brief generation failed: the model returned an empty summary.';

// ---- Rate limit (NFR-12) ----
export const BRIEF_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
