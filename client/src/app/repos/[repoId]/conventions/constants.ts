import type { ConventionStatus } from "@devdigest/shared";

/** Constants for the Conventions board (L02). */

/** Triage filter chips, in the order they appear. `all` is not a status. */
export const FILTER_KEYS = ["all", "pending", "accepted", "rejected"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * The card's left edge, which is how a triaged card is recognised at a glance
 * while scrolling: accepted reads as done, rejected recedes, pending is neutral.
 */
export const STATUS_ACCENTS: Record<ConventionStatus, string> = {
  pending: "var(--border-strong)",
  accepted: "var(--ok)",
  rejected: "var(--text-muted)",
};

export const CREATE_SKILL_MODAL_WIDTH = 720;

/**
 * The confidence bar's colour, graded on four steps. Ordered high → low and
 * read by `confidenceColor()`, which takes the first band the score reaches, so
 * each `min` is INCLUSIVE and the last one must be 0 for the list to be total.
 *
 * The score is the model's own, so the grading is about how much weight a
 * reviewer should give a rule, not about whether its evidence holds — an
 * ungrounded candidate never reaches the board at all.
 */
export const CONFIDENCE_BANDS = [
  { min: 85, color: "var(--ok)" },
  { min: 70, color: "var(--yellow)" },
  { min: 60, color: "var(--orange)" },
  { min: 0, color: "var(--crit)" },
] as const;
