import type { CSSProperties } from "react";

/** Co-located styles for FindingsCell. Chrome mirrors kit/Dropdown.tsx. */
export const s = {
  /** Panel box, also used by the flip/clamp maths in the component. */
  PANEL_W: 420,
  PANEL_MAX_H: 360,

  muted: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    background: "none",
    border: "none",
    cursor: "default",
    color: "inherit",
  } satisfies CSSProperties,
  panel: (pos: { top: number; left: number } | null): CSSProperties => ({
    position: "fixed",
    // Until the first layout pass measures the trigger, keep it off-screen
    // rather than flashing at 0,0.
    top: pos?.top ?? -9999,
    left: pos?.left ?? -9999,
    width: 420,
    maxHeight: 360,
    overflowY: "auto",
    zIndex: 45, // above Dropdown (40), below Modal (50)
    padding: 12,
    borderRadius: 9,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    boxShadow: "var(--shadow-modal)",
    animation: "ddpop .12s ease",
  }),
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  panelList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  panelMore: {
    marginTop: 10,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
