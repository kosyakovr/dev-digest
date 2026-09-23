import type { CSSProperties } from "react";

/** Co-located styles for NewSkillModal. */
export const s = {
  // `Modal` renders its body edge-to-edge — every caller pads its own.
  body: { display: "flex", flexDirection: "column", gap: 14, padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
