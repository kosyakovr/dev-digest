/* FindingPreview — one finding rendered READ-ONLY: severity, title, category,
   file:line, confidence, and a one-line description.

   Two constraints are load-bearing, not stylistic:

   1. It renders NO interactive element — no button, no link, not even a
      MonoLink (which is an <a>/<button>). That is what makes it safe inside the
      PR list's hover popover, where acting on a finding is deliberately not
      offered: accept/dismiss live on the PR detail page's run card, where there
      is room to read the full markdown rationale first.
   2. It calls NO useTranslations. All its text comes from the data plus the
      SEV/CAT labels in the UI kit. That is what lets it render under the PR
      list's `prReview` provider AND under the trace drawer's `runs` provider
      without either surface having to widen its namespaces. */
"use client";

import React from "react";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity, type Category } from "@devdigest/ui";
import { lineLabel } from "./helpers";
import { s } from "./styles";

/** Structurally compatible with both PrFindingPreview and FindingRecord. */
export interface FindingPreviewData {
  id: string;
  /** Widened to string: `findings.severity` is free text in the DB. */
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line?: number | null;
  confidence: number;
  description?: string | null;
}

/** Severities the kit can render; anything else falls back to a neutral badge. */
const KNOWN_SEVERITIES = new Set(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]);
const KNOWN_CATEGORIES = new Set(["bug", "security", "perf", "style", "test"]);

export function FindingPreview({ finding: f }: { finding: FindingPreviewData }) {
  const severity = (KNOWN_SEVERITIES.has(f.severity) ? f.severity : "INFO") as Severity;
  return (
    <div data-finding-id={f.id} data-severity={f.severity} style={s.card}>
      <div style={s.titleRow}>
        <SeverityBadge severity={severity} />
        <span style={s.title}>{f.title}</span>
        {KNOWN_CATEGORIES.has(f.category) && <CategoryTag category={f.category as Category} />}
      </div>
      <div style={s.metaRow}>
        <span className="mono" style={s.location}>
          {f.file}:{lineLabel(f)}
        </span>
        <ConfidenceNum value={f.confidence} />
      </div>
      {f.description && <p style={s.description}>{f.description}</p>}
    </div>
  );
}

export default FindingPreview;
