/* SeverityFilterBar — two rows beneath a run's verdict banner:

   1. COUNTERS: "N CRITICAL · N WARNING · N SUGGESTION", showing only the
      severities actually present in this run. Non-interactive by design — each
      number equals the number of finding cards rendered below, which is only
      true because the panel hands us the list it is about to render (so the
      "Hide low confidence" toggle moves these numbers too).
   2. FILTERS: all three severity buttons, always shown, so the filter set does
      not shift under the pointer as runs differ. Clicking the active one clears
      the filter.

   Note the counters and the accordion header's "N findings" deliberately can
   disagree: the header describes the RUN, these describe the current VIEW. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import { FILTERABLE_SEVERITIES, SEVERITY_COUNT_KEY, SEVERITY_LABEL_KEY } from "./constants";
import { s } from "./styles";

export function SeverityFilterBar({
  counts,
  active,
  onToggle,
}: {
  /** Severity → number of cards about to be rendered below. */
  counts: Record<string, number>;
  active: string | null;
  onToggle: (severity: string) => void;
}) {
  const t = useTranslations("prReview");
  const present = FILTERABLE_SEVERITIES.filter((sev) => (counts[sev] ?? 0) > 0);

  return (
    <div style={s.wrap}>
      {present.length > 0 && (
        <div style={s.counters} aria-label={t("panel.severityCounts")}>
          {present.map((sev, i) => {
            const meta = SEV[sev as Severity];
            const SevIcon = Icon[meta.icon];
            return (
              <React.Fragment key={sev}>
                {i > 0 && <span style={s.separator}>·</span>}
                <span className="tnum" style={s.counter(meta.c, meta.bg)}>
                  <SevIcon size={12.5} />
                  {t(SEVERITY_COUNT_KEY[sev]!, { count: counts[sev]! })}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div style={s.filters} role="group" aria-label={t("panel.filterBySeverity")}>
        {FILTERABLE_SEVERITIES.map((sev) => {
          const meta = SEV[sev as Severity];
          const on = active === sev;
          return (
            <button
              key={sev}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(sev)}
              style={s.filterButton(meta.c, meta.bg, on)}
            >
              {t(SEVERITY_LABEL_KEY[sev]!)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SeverityFilterBar;
