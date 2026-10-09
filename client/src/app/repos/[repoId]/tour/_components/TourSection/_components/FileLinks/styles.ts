import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  path: { fontSize: 13, wordBreak: "break-all" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  open: { fontSize: 12.5, color: "var(--accent-text)", textDecoration: "underline", flexShrink: 0 } satisfies CSSProperties,
} as const;
