import type { CSSProperties } from "react";

/** Co-located styles for the Project Context doc list. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 8,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 12.5,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  groupHead: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    margin: "12px 0 4px",
  } satisfies CSSProperties,
  item: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid " + (selected ? "var(--accent)" : "transparent"),
    background: selected ? "var(--bg-hover)" : "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
  }),
  path: { fontSize: 12.5, flex: 1, wordBreak: "break-all" } satisfies CSSProperties,
  tokens: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
