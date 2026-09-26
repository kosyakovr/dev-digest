import type { CSSProperties } from "react";

/** Co-located styles for the skill Preview tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 7px",
    borderRadius: 4,
  }),
  body: {
    padding: "16px 18px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
