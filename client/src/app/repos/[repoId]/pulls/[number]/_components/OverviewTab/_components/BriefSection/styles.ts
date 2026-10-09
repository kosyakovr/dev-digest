import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  meta: { marginTop: 8, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  status: { marginTop: 8, fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 10 } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
