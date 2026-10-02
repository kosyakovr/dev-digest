/* DiffToolbar — the row above the Files changed diff: "N files · +A −D" on the
   left, the Smart order / Original order toggle on the right. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DIFF_ORDER_OPTIONS, type DiffOrder } from "./constants";
import { ts } from "./styles";

interface DiffToolbarProps {
  filesCount: number;
  additions: number;
  deletions: number;
  order: DiffOrder;
  onOrderChange: (order: DiffOrder) => void;
}

export function DiffToolbar({ filesCount, additions, deletions, order, onOrderChange }: DiffToolbarProps) {
  const t = useTranslations("prReview");
  return (
    <div style={ts.bar}>
      <div style={ts.totals}>
        {t("smartDiff.filesCount", { count: filesCount })} ·{" "}
        <span className="mono tnum" style={ts.add}>
          +{additions}
        </span>{" "}
        <span className="mono tnum" style={ts.del}>
          −{deletions}
        </span>
      </div>
      <div role="group" aria-label={t("smartDiff.orderLabel")} style={ts.segmented}>
        {DIFF_ORDER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={order === o.value}
            onClick={() => onOrderChange(o.value)}
            style={ts.option(order === o.value)}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
