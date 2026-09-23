import type { CSSProperties } from "react";

/** Co-located styles for FindingPreview. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  location: {
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  description: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    // The description arrives pre-flattened and truncated from the server, but
    // a FindingRecord's raw markdown rationale can be far longer — clamp so a
    // long one cannot blow out the popover.
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
