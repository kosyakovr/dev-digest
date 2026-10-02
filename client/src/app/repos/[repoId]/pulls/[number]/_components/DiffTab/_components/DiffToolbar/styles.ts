import type { CSSProperties } from "react";

export const ts = {
  bar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" } satisfies CSSProperties,
  totals: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  add: { color: "var(--code-add-text)" } satisfies CSSProperties,
  del: { color: "var(--code-del-text)" } satisfies CSSProperties,
  segmented: {
    marginLeft: "auto",
    display: "flex",
    gap: 2,
    padding: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  option: (on: boolean): CSSProperties => ({
    padding: "3px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    background: on ? "var(--bg-elevated)" : "transparent",
    color: on ? "var(--text-primary)" : "var(--text-muted)",
  }),
} as const;
