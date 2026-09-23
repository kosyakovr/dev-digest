import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";
import { STATUS_ACCENTS } from "../../constants";

/**
 * Co-located styles for one convention candidate card.
 *
 * The layout rule that matters: the card is a 3-column flex row and only the
 * MIDDLE column may grow. A rule can be a paragraph long, so the middle column
 * carries `minWidth: 0` (without it a flex item refuses to shrink below its
 * content and squeezes its siblings) while the checkbox and the action rail are
 * `flexShrink: 0` at a fixed width. Nothing that renders rule text is allowed
 * outside that middle column.
 */
export const s = {
  card: (status: ConventionStatus, selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 10,
    background: "var(--bg-surface)",
    // All four sides as longhands: mixing the `border` shorthand with a
    // `borderLeft` override makes React drop one of them on a re-render (it
    // warns about exactly this), and selection re-renders this card.
    borderStyle: "solid",
    borderWidth: "1px 1px 1px 3px",
    borderColor: (() => {
      const edge = selected ? "var(--accent)" : "var(--border)";
      return `${edge} ${edge} ${edge} ${STATUS_ACCENTS[status]}`;
    })(),
  }),

  checkbox: { flexShrink: 0, paddingTop: 3 } satisfies CSSProperties,
  /** The checkbox's accessible name — read by AT and by tests, never displayed. */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,

  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,

  titleRow: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  rule: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    fontStyle: "italic",
    lineHeight: 1.4,
    // A single unbroken token (a URL, a long identifier) must not set the
    // column's width — it wraps instead.
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  category: {
    flexShrink: 0,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "3px 8px",
    borderRadius: 999,
  } satisfies CSSProperties,
  rationale: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,

  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 6px 6px 12px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  evidencePath: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    color: "var(--text-secondary)",
    textDecoration: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    background: "var(--bg-primary)",
    fontSize: 12,
    lineHeight: 1.6,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    // The code keeps its own line breaks and scrolls sideways rather than
    // widening the card.
    whiteSpace: "pre",
    overflowX: "auto",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  bar: {
    width: 170,
    maxWidth: "40%",
    height: 5,
    borderRadius: 3,
    background: "var(--bg-hover)",
    overflow: "hidden",
  } satisfies CSSProperties,
  barFill: (pct: number, color: string): CSSProperties => ({
    display: "block",
    width: `${pct}%`,
    height: "100%",
    borderRadius: 3,
    background: color,
  }),

  actions: {
    flexShrink: 0,
    width: 172,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  minorActions: { display: "flex", gap: 8 } satisfies CSSProperties,

  editFields: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
