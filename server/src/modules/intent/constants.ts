/**
 * L03 — Intent Layer literals: budgets, limits, model bounds. One place, so the
 * numbers in the spec (`docs/specs/L03-intent-layer.md` § Data sources) and
 * the code cannot drift.
 */

export const INTENT_PROMPT_VERSION = '1';
export const INTENT_SCHEMA_NAME = 'PrIntentClassification';

// ---- source budgets (chars unless noted) -----------------------------------
export const MAX_TITLE_CHARS = 300;
export const MAX_BODY_CHARS = 6_000;
export const MAX_TICKETS = 2;
export const MAX_TICKET_TITLE_CHARS = 300;
export const MAX_TICKET_BODY_CHARS = 4_000;
export const MAX_SPECS = 3;
/** Raw blob size limit for a spec read (bytes). Larger → `too_large`. */
export const MAX_SPEC_BYTES = 200_000;
export const MAX_SPEC_CHARS = 8_000;
export const MAX_SPEC_TOTAL_CHARS = 16_000;
/** Unresolved `link` entries kept in `sources`. */
export const MAX_UNRESOLVED_LINKS = 10;
export const MAX_COMMITS = 20;
export const MAX_COMMIT_CHARS = 200;
export const MAX_COMMITS_TOTAL_CHARS = 3_000;
export const MAX_BRANCH_CHARS = 200;
export const MAX_FILES = 100;
export const MAX_FILES_CHARS = 4_000;
export const MAX_DIFF_CHARS = 8_000;

/** Spec/plan files are read only when they have one of these extensions. */
export const SPEC_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'] as const;

// ---- confidence ------------------------------------------------------------
/** Characters of real prose a body needs (after noise removal) to count as substantive. */
export const MIN_SUBSTANTIVE_BODY_CHARS = 60;

// ---- classifier output clamps (applied in code; a schema `.max()` would trigger a paid reprompt)
export const MAX_INTENT_STATEMENT_CHARS = 300;
export const MAX_SCOPE_ITEMS = 6;
export const MAX_SCOPE_ITEM_CHARS = 160;

// ---- model call bounds ------------------------------------------------------
// `timeoutMs` is PER ATTEMPT (server/INSIGHTS.md 2026-09-23): worst case is
// timeoutMs × (maxRetries + 1) = 40 s.
export const INTENT_TEMPERATURE = 0;
/**
 * Output cap. The default model reasons before answering and its hidden
 * reasoning counts against this cap: a live probe saw 0–800+ reasoning tokens
 * per call beside a ~300–400-token answer, so 800 cut half the calls off mid-JSON.
 * Only generated tokens are billed, so the headroom costs nothing on success.
 */
export const INTENT_MAX_TOKENS = 3_000;
export const INTENT_TIMEOUT_MS = 20_000;
export const INTENT_MAX_RETRIES = 1;

/** Whole review-time step (gather + model call + persist). On expiry the review runs without intent. */
export const INTENT_REVIEW_BUDGET_MS = 45_000;
