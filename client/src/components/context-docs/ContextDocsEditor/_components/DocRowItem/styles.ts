import type { CSSProperties } from "react";

/** Co-located styles for one doc row. */
export const s = {
  row: (attached: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: attached ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.4 : 1,
  }),
  handle: (active: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    cursor: active ? "grab" : "default",
    visibility: active ? "visible" : "hidden",
    display: "inline-flex",
  }),
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  path: { fontSize: 12.5, fontWeight: 600, flex: 1, wordBreak: "break-all" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  notFound: { fontSize: 12, color: "var(--warn)", whiteSpace: "nowrap" } satisfies CSSProperties,
  moveGroup: { display: "flex", gap: 2 } satisfies CSSProperties,
  moveBtn: (disabled: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    padding: 2,
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
  }),
} as const;
