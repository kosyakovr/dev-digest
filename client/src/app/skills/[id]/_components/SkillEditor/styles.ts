import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", minHeight: 0 } satisfies CSSProperties,
  tabsBar: { flexShrink: 0 } satisfies CSSProperties,
  body: { padding: "22px 28px 40px" } satisfies CSSProperties,
} as const;
