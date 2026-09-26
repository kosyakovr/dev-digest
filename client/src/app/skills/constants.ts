/** Shared constants for the Skills feature. */

/** Card grid template — matches the Agents list so the two pages align. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(280px, 1fr))";

/**
 * Type chip colours, from the design's `SKILL_TYPE` map. Types are user-editable,
 * so this is a lookup with a fallback rather than an exhaustive record — a
 * user-authored type renders in the neutral colour.
 */
export const TYPE_COLORS: Record<string, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Neutral chip colour for a type outside the seeded defaults. */
export const TYPE_COLOR_FALLBACK = "#999999";

/** Extensions the import dialog accepts. Markdown only — a skill is text. */
export const MARKDOWN_ACCEPT = ".md,.markdown";
