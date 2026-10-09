import type { CSSProperties } from "react";

/** Co-located styles for the Project Context page. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 18 } satisfies CSSProperties,
  split: { display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 24 } satisfies CSSProperties,
  pane: {
    padding: 20,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
