import type { CSSProperties } from "react";
import type { DiffOp } from "../../../../../helpers";

/** Co-located styles for the skill Versions tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  card: (current: boolean): CSSProperties => ({
    borderRadius: 9,
    border: "1px solid " + (current ? "var(--border-strong)" : "var(--border)"),
    background: current ? "var(--bg-hover)" : "var(--bg-elevated)",
    padding: 14,
  }),
  cardHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  version: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  timestamp: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 6 } satisfies CSSProperties,
  diffPanel: {
    marginTop: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  diffCaption: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11.5,
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  stat: (color: string): CSSProperties => ({ color, fontWeight: 600 }),
  diffBody: { maxHeight: 320, overflow: "auto", padding: "8px 0" } satisfies CSSProperties,
  diffRow: (op: DiffOp): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "1px 12px",
    fontSize: 12.5,
    lineHeight: "20px",
    whiteSpace: "pre-wrap",
    background:
      op === "added" ? "var(--code-add)" : op === "removed" ? "var(--code-del)" : "transparent",
    color: op === "same" ? "var(--text-secondary)" : "var(--text-primary)",
  }),
  diffSign: {
    width: 10,
    flexShrink: 0,
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
