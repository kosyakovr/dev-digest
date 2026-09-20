/* FindingsCell — the PR list's FINDINGS column: one compact severity badge per
   severity present in the latest review run, and a hover popover previewing
   that run's findings.

   The popover is READ-ONLY (see FindingPreview): the list is for triage, and
   accepting or dismissing a finding needs the full rationale, which lives on the
   PR detail page.

   Positioning: the panel is `position: fixed`, because the list's tableCard sets
   `overflow: hidden` — which clips absolutely-positioned descendants but not
   fixed ones, and no ancestor establishes a containing block. That avoids a
   portal (this codebase has never used one; kit/Modal.tsx is the precedent), at
   the cost of not following the scroll container — hence the close-on-scroll. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import type { PrFindingsRollup } from "@/lib/types";
import { FindingPreview } from "@/components/finding-preview";
import { POPOVER_CLOSE_DELAY_MS, SEVERITY_ORDER } from "../../constants";
import { s } from "./styles";

export function FindingsCell({ rollup }: { rollup: PrFindingsRollup | null | undefined }) {
  const t = useTranslations("prReview");
  const panelId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const openNow = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(true);
  }, []);
  // Delayed, so the pointer can cross the gap from the trigger into the panel
  // without the panel vanishing underneath it.
  const closeSoon = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), POPOVER_CLOSE_DELAY_MS);
  }, []);

  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const flipUp = r.bottom + s.PANEL_MAX_H + 8 > window.innerHeight;
    setPos({
      top: flipUp ? Math.max(8, r.top - s.PANEL_MAX_H - 8) : r.bottom + 8,
      left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - s.PANEL_W - 8)),
    });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // A fixed panel does not follow the scroll container, so closing is the
    // honest behaviour rather than letting it drift away from its row.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Never reviewed — "—" rather than a confident zero.
  if (rollup == null) return <span style={s.muted}>—</span>;
  // Reviewed and clean: a real zero, but nothing to preview.
  if (rollup.total === 0)
    return (
      <span className="tnum" style={s.muted}>
        0
      </span>
    );

  const hidden = rollup.total - rollup.preview.length;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t("list.findingsAria", { count: rollup.total })}
        // The whole row navigates on click; this trigger must not. Stopping the
        // click also covers Enter/Space, which browsers dispatch as clicks.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onFocus={openNow}
        onBlur={closeSoon}
        style={s.trigger}
      >
        {SEVERITY_ORDER.filter((sev) => rollup.by_severity[sev] > 0).map((sev) => (
          <SeverityBadge key={sev} severity={sev as Severity} count={rollup.by_severity[sev]} compact />
        ))}
      </button>

      {open && (
        <div
          id={panelId}
          role="tooltip"
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
          style={s.panel(pos)}
        >
          <div style={s.panelTitle}>{t("list.findingsInRun", { count: rollup.total })}</div>
          <div style={s.panelList}>
            {rollup.preview.map((f) => (
              <FindingPreview key={f.id} finding={f} />
            ))}
          </div>
          {hidden > 0 && <div style={s.panelMore}>{t("list.findingsMore", { count: hidden })}</div>}
        </div>
      )}
    </>
  );
}

export default FindingsCell;
