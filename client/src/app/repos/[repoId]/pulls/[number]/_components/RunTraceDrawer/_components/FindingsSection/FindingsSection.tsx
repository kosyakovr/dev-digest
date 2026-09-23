/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection.

   Read-only on purpose: the drawer answers "what did this run produce", and
   accept/dismiss stay on the PR page's run card so there is exactly one place
   that mutates a finding. Uses the shared FindingPreview, so the severity
   colours, category and confidence here match every other surface. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingPreview } from "@/components/finding-preview";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";

export function FindingsSection({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge color="var(--text-muted)">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span style={s.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {findings.map((f) => (
            <FindingPreview key={f.id} finding={{ ...f, description: f.rationale }} />
          ))}
        </div>
      )}
    </TraceSection>
  );
}
