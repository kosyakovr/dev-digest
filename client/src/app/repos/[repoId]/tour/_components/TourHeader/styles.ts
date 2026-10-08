import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
