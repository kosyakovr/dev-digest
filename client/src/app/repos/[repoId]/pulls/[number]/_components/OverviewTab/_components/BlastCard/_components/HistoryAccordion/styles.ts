import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
  } satisfies CSSProperties,
  chevron: { marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 12, marginTop: 12, minWidth: 0 } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 } satisfies CSSProperties,
  rowTop: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8, fontSize: 13 } satisfies CSSProperties,
  title: { color: "var(--text-primary)", fontWeight: 500, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  notes: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
