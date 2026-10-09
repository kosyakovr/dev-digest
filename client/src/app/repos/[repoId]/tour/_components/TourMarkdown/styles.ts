import type { CSSProperties } from "react";

export const s = {
  root: { lineHeight: 1.55 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
