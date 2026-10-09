import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--text-secondary)",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  location: { color: "var(--accent-text)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--warn)", marginBottom: 8 } satisfies CSSProperties,
} as const;
