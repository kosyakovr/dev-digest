import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilterBar. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 12,
  } satisfies CSSProperties,
  counters: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  separator: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  counter: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
    // The label is already uppercase in the message — see SEVERITY_COUNT_KEY.
    letterSpacing: "0.04em",
  }),
  filters: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  filterButton: (color: string, bg: string, on: boolean): CSSProperties => ({
    padding: "4px 11px",
    borderRadius: 6,
    // All-longhand: never mix the `border` shorthand with a longhand elsewhere
    // on the same element across rerenders (React warns).
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: on ? color : "var(--border)",
    background: on ? bg : "transparent",
    color: on ? color : "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "color .12s, border-color .12s, background .12s",
  }),
} as const;
