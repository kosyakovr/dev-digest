import type { CSSProperties } from "react";

export const s = {
  tree: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: "4px 0",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 14,
    textAlign: "left",
  } satisfies CSSProperties,
  symbol: { fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6 } satisfies CSSProperties,
  caller: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    minWidth: 0,
  } satisfies CSSProperties,
  via: { fontSize: 12, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 } satisfies CSSProperties,
  badges: { display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 18 } satisfies CSSProperties,
} as const;
