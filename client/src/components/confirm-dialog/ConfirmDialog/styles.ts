import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
