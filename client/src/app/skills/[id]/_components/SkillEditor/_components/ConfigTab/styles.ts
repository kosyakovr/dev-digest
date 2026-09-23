import type { CSSProperties } from "react";

/** Co-located styles for the skill Config tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 18 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  versionNote: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 8 } satisfies CSSProperties,
} as const;
