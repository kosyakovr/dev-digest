import type { CSSProperties } from "react";

/** Co-located styles for the Onboarding Tour page shell. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 960, margin: "0 auto" } satisfies CSSProperties,
  center: { padding: "60px 24px", textAlign: "center", color: "var(--text-secondary)" } satisfies CSSProperties,
  pendingBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  sections: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
