import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  command: {
    fontSize: 13,
    padding: "4px 8px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  feedback: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  failed: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
