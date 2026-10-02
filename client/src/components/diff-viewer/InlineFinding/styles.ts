import type { CSSProperties } from "react";

/** Co-located styles for InlineFinding (a simplified FindingCard for the diff). */
export const is = {
  card: (color: string): CSSProperties => ({
    margin: "6px 12px 6px 56px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: color,
    borderRadius: 7,
    background: "var(--bg-elevated)",
    padding: "10px 12px",
    fontFamily: "inherit",
  }),
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  accepted: { fontSize: 12, fontWeight: 600, color: "var(--ok)" } satisfies CSSProperties,
  prose: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    marginTop: 6,
  } satisfies CSSProperties,
  fixLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginTop: 10,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 10 } satisfies CSSProperties,
} as const;
