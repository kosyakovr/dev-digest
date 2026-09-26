import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  // `Modal` renders its body edge-to-edge — every caller pads its own.
  body: { display: "flex", flexDirection: "column", gap: 14, padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  // Visually hidden but still reachable by label/keyboard and by tests: a native
  // file input cannot be styled to match the kit's Button.
  fileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginLeft: 10 } satisfies CSSProperties,
  error: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  previewHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
    borderTop: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  previewTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  bodyPreview: {
    margin: 0,
    padding: "12px 14px",
    maxHeight: 220,
    overflow: "auto",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
