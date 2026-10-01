/* InlineFinding — compact finding card rendered under a diff line. A simplified
   copy of the route-local FindingCard (which components/ must not import):
   severity, title, line range, confidence, rationale, suggested fix, Accept /
   Dismiss. Colours come only from SEV / SeverityBadge. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV, SeverityBadge, ConfidenceNum, Button, Markdown } from "@devdigest/ui";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { is } from "./styles";

export function InlineFinding({
  f,
  pending,
  onAction,
}: {
  f: FindingRecord;
  pending?: boolean;
  onAction: (action: FindingActionKind) => void;
}) {
  const t = useTranslations("shell");
  const tr = useTranslations("prReview");
  const lines =
    f.start_line === f.end_line
      ? t("diffViewer.lineSingle", { start: f.start_line })
      : t("diffViewer.lineRange", { start: f.start_line, end: f.end_line });

  return (
    <div data-finding-id={f.id} data-severity={f.severity} style={is.card(SEV[f.severity].c)}>
      <div style={is.head}>
        <SeverityBadge severity={f.severity} compact />
        <span style={is.title}>{f.title}</span>
        <span style={is.meta}>{lines}</span>
        <ConfidenceNum value={f.confidence} />
        {f.accepted_at && <span style={is.accepted}>{tr("finding.accepted")}</span>}
      </div>
      <div style={is.prose}>
        <Markdown>{f.rationale}</Markdown>
      </div>
      {f.suggestion && (
        <>
          <div style={is.fixLabel}>{tr("finding.suggestedFix")}</div>
          <div style={is.prose}>
            <Markdown>{f.suggestion}</Markdown>
          </div>
        </>
      )}
      <div style={is.actions}>
        <Button kind="secondary" size="sm" icon="Check" disabled={pending} onClick={() => onAction("accept")}>
          {tr("finding.accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" disabled={pending} onClick={() => onAction("dismiss")}>
          {tr("finding.dismiss")}
        </Button>
      </div>
    </div>
  );
}
