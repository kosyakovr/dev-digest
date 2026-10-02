import type { CSSProperties } from "react";

export const s = {
  card: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  counts: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  toggle: { display: "flex", gap: 4 } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  noticeText: { minWidth: 0 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  divider: { borderTop: "1px solid var(--border)", margin: 0 } satisfies CSSProperties,
} as const;
