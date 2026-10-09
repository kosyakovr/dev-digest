import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, marginTop: 4 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  severity: (color: string): CSSProperties => ({ fontSize: 12, fontWeight: 700, color }),
  fileBtn: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 13,
    color: "var(--accent-text)",
    textAlign: "left",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  toggle: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  explanation: { margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  refs: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
