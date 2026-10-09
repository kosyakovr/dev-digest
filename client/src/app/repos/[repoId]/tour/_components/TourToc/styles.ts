import type { CSSProperties } from "react";

export const s = {
  toc: { marginBottom: 16 } satisfies CSSProperties,
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  entry: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--accent-text)",
    fontSize: 12.5,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
