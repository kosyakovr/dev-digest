import type { CSSProperties } from "react";

/** Co-located styles for the Conventions board. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
    maxWidth: 620,
  } satisfies CSSProperties,

  summary: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginBottom: 16,
  } satisfies CSSProperties,
  summaryLabel: {
    fontWeight: 600,
    color: "var(--text-primary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: 11,
  } satisfies CSSProperties,
  summaryDot: { color: "var(--text-muted)" } satisfies CSSProperties,

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  chips: { display: "flex", gap: 6, flex: 1, flexWrap: "wrap" } satisfies CSSProperties,
  chip: (active: boolean): CSSProperties => ({
    padding: "5px 11px",
    borderRadius: 999,
    fontSize: 12.5,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
  }),
  selectionCount: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  filterEmpty: {
    padding: "28px 0",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
