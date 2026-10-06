import type { CSSProperties } from "react";

/** Co-located styles for the shared Context docs editor. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 12,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 12.5,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  inherited: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px dashed var(--border)",
    marginBottom: 12,
  } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
  groupHead: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    margin: "14px 0 6px",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12, marginTop: 16 } satisfies CSSProperties,
  total: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
