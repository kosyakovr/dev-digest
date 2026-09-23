import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. `kit/Modal` renders children
    edge-to-edge, so the body pads itself. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  state: { padding: 24, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { padding: 24, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
