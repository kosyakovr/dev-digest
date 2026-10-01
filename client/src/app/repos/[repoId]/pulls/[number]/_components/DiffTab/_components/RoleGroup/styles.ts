import type { CSSProperties } from "react";

export const rs = {
  group: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 4px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
  } satisfies CSSProperties,
  label: { flex: 1 } satisfies CSSProperties,
  findingsDot: { fontWeight: 600 } satisfies CSSProperties,
  count: { color: "var(--text-muted)", fontWeight: 400 } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
} as const;
