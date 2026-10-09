import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 650 } satisfies CSSProperties,
  chevron: { transform: "rotate(-90deg)", transition: "transform .12s" } satisfies CSSProperties,
  chevronOpen: { transition: "transform .12s" } satisfies CSSProperties,
  body: { padding: "4px 16px 16px", fontSize: 14 } satisfies CSSProperties,
  muted: { color: "var(--text-secondary)", fontSize: 13.5, margin: 0 } satisfies CSSProperties,
} as const;
