/* RiskAreas — the brief's risks, rendered inside the Intent card (children slot).
   Model text is rendered as plain text only (NFR-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Risk, RiskSeverity } from "@devdigest/shared";
import { s } from "./styles";

const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

function RiskRow({ risk, onOpenFile }: { risk: Risk; onOpenFile: (file: string) => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const first = risk.file_refs[0];
  return (
    <li style={s.row}>
      <div style={s.head}>
        <span style={s.title}>{risk.title}</span>
        <Badge color={SEVERITY_COLOR[risk.severity] ?? "var(--text-muted)"} style={s.severity}>
          {t(`severity.${risk.severity}`)}
        </Badge>
      </div>
      {first && (
        <button
          type="button"
          className="mono"
          style={s.fileBtn}
          aria-label={t("risk.open", { file: first })}
          onClick={() => onOpenFile(first)}
        >
          {first}
        </button>
      )}
      <button type="button" style={s.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {t("risk.why")}
      </button>
      {open && (
        <>
          <p style={s.explanation}>{risk.explanation}</p>
          <div style={s.refs}>
            {risk.file_refs.map((f) => (
              <button
                key={f}
                type="button"
                className="mono"
                style={s.fileBtn}
                aria-label={t("risk.open", { file: f })}
                onClick={() => onOpenFile(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </>
      )}
    </li>
  );
}

export function RiskAreas({
  risks,
  loading,
  onOpenFile,
}: {
  risks: Risk[];
  loading: boolean;
  onOpenFile: (file: string) => void;
}) {
  const t = useTranslations("brief");
  return (
    <div style={s.wrap}>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {loading ? (
        <Skeleton height={60} />
      ) : risks.length === 0 ? (
        <div style={s.muted}>{t("noRisks")}</div>
      ) : (
        <ul style={s.list}>
          {risks.map((r, i) => (
            <RiskRow key={`${r.kind}:${r.title}:${i}`} risk={r} onOpenFile={onOpenFile} />
          ))}
        </ul>
      )}
    </div>
  );
}
