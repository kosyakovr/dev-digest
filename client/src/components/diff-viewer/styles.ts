import type { CSSProperties } from "react";
import type { Line } from "./helpers";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent). */
export function lineRowFor(kind: Line["kind"]): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  return { display: "flex", alignItems: "stretch", fontSize: 13, lineHeight: "20px", background };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}

/** Left stripe on a diff row that carries findings (colour = worst severity, from SEV). */
export function findingStripeFor(color: string): CSSProperties {
  return { boxShadow: `inset 3px 0 0 ${color}` };
}

/** The per-line badge button that toggles the stacked finding cards: outlined
    and tinted while the cards are open, text-only while they are hidden. */
export function findingLabelFor(color: string, bg: string, open: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    alignSelf: "center",
    flexShrink: 0,
    margin: "1px 8px 1px 0",
    padding: "0 7px",
    fontSize: 11,
    fontWeight: 600,
    lineHeight: "18px",
    color,
    background: open ? bg : "transparent",
    border: `1px solid ${open ? color : "transparent"}`,
    borderRadius: 5,
    cursor: "pointer",
  };
}

/** A diff row a deep link points at: an accent stripe and tint over the row. */
const TARGET_LINE_BG = "var(--accent-bg)";
export const targetLineStyle: CSSProperties = {
  boxShadow: "inset 3px 0 0 var(--accent)",
  background: TARGET_LINE_BG,
};

/** One-off pulse of the deep-linked row: fades from a stronger accent tint to
    the resting tint (Web Animations API; no global keyframes). */
export const TARGET_PULSE_DURATION_MS = 1600;
export const targetPulseKeyframes: Keyframe[] = [
  { background: "color-mix(in srgb, var(--accent) 45%, transparent)" },
  { background: TARGET_LINE_BG },
];

/** Heading + list wrapper for findings that have no rendered line. */
export const outsideStyles = {
  wrap: { padding: "8px 0", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  heading: {
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  /** The inline card's left margin is sized for diff rows; reset it here. */
  item: { marginLeft: -44 } satisfies CSSProperties,
} as const;
