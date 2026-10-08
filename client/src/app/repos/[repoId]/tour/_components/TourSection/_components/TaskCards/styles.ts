import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  card: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  title: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  scope: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  difficulty: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
