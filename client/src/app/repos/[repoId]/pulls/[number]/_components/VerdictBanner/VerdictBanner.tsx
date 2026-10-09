/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score.
   Every part but the summary is optional, so the Risk Brief can reuse it with a
   summary and a refresh action only (Overview) while the Agent runs banner is unchanged. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Badge, CircularScore } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { VERDICT_META } from "./constants";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount,
  blockers = 0,
  agentName,
  loading,
  onRegenerate,
  regenerateLabel,
  regenerateDisabled,
  provenance,
  footer,
}: {
  verdict?: Verdict | null;
  summary: string | null;
  score?: number | null;
  findingsCount?: number;
  blockers?: number;
  agentName?: string | null;
  loading?: boolean;
  onRegenerate?: () => void;
  regenerateLabel?: string;
  regenerateDisabled?: boolean;
  provenance?: string;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const m = verdict ? (VERDICT_META[verdict] ?? VERDICT_META.comment) : null;
  const VIcon = m ? Icon[m.icon] : null;
  return (
    <div style={s.wrap}>
      {m && VIcon && (
        <div style={s.iconBox(m.bg, m.c)}>
          <VIcon size={22} />
        </div>
      )}
      <div style={s.main}>
        <div style={s.titleRow}>
          {m && <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>}
          {findingsCount != null && (
            <Badge color="var(--text-secondary)">
              {t("verdict.findingsCount", { count: findingsCount })}
              {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
            </Badge>
          )}
          {agentName && (
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
              {agentName}
            </Badge>
          )}
          {provenance && (
            <span role="img" aria-label={provenance} title={provenance} style={s.provenance}>
              <Icon.Info size={14} />
            </span>
          )}
          {onRegenerate && (
            <span style={s.regenerate}>
              <IconBtn
                icon="RefreshCw"
                label={regenerateLabel ?? ""}
                onClick={onRegenerate}
                disabled={regenerateDisabled}
              />
            </span>
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
        {footer}
      </div>
      {loading ? (
        <div style={s.scoreCol}>
          <Icon.RefreshCw size={20} style={s.spinner} />
        </div>
      ) : (
        score != null && (
          <div style={s.scoreCol}>
            <CircularScore score={score} size={52} stroke={5} />
            <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
          </div>
        )
      )}
    </div>
  );
}
