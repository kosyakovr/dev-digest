import type { CSSProperties } from "react";

/** Co-located styles for DocPreview. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  path: { fontSize: 14, fontWeight: 700, wordBreak: "break-all" } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  body: { fontSize: 13.5, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
