/* ConventionCard — one extracted house rule with the code that proves it.
   The snippet is what the server re-read from the file, never the model's text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, IconBtn, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { confidenceColor, evidenceUrl } from "../../helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onStatus: (id: string, status: ConventionStatus) => void;
  onEdit: (id: string, patch: { rule: string; rationale: string | null }) => void;
  onDelete: (id: string) => void;
  repoFullName?: string;
  repoBranch?: string;
  busy?: boolean;
}

export function ConventionCard({
  candidate,
  selected,
  onToggleSelected,
  onStatus,
  onEdit,
  onDelete,
  repoFullName,
  repoBranch,
  busy = false,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [rationale, setRationale] = React.useState(candidate.rationale ?? "");

  const startEdit = () => {
    setRule(candidate.rule);
    setRationale(candidate.rationale ?? "");
    setEditing(true);
  };

  const save = () => {
    onEdit(candidate.id, { rule: rule.trim(), rationale: rationale.trim() || null });
    setEditing(false);
  };

  const pct = Math.round(candidate.confidence * 100);
  const at = t("card.evidenceAt", {
    path: candidate.evidence_path,
    line: candidate.evidence_line,
  });
  const href = evidenceUrl(
    repoFullName,
    repoBranch,
    candidate.evidence_path,
    candidate.evidence_line,
  );
  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";

  return (
    <div style={s.card(candidate.status, selected)}>
      <div style={s.checkbox}>
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelected(candidate.id)}
          label={<span style={s.srOnly}>{t("card.select", { rule: candidate.rule })}</span>}
        />
      </div>

      <div style={s.main}>
        {editing ? (
          <div style={s.editFields}>
            <FormField label={t("card.rule")} required>
              <TextInput value={rule} onChange={setRule} />
            </FormField>
            <FormField label={t("card.rationale")}>
              <Textarea
                value={rationale}
                onChange={setRationale}
                rows={2}
                placeholder={t("card.rationalePlaceholder")}
              />
            </FormField>
          </div>
        ) : (
          <>
            <div style={s.titleRow}>
              <h3 style={s.rule}>{candidate.rule}</h3>
              <span style={s.category}>{candidate.category}</span>
            </div>
            {candidate.rationale ? <p style={s.rationale}>{candidate.rationale}</p> : null}
          </>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHeader}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                style={s.evidencePath}
                title={t("card.viewOnGitHub")}
              >
                {at}
              </a>
            ) : (
              <span style={s.evidencePath}>{at}</span>
            )}
            <IconBtn
              icon="Copy"
              size={26}
              label={t("card.copyEvidence")}
              onClick={() => void navigator.clipboard?.writeText(candidate.evidence_snippet)}
            />
          </div>
          <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
        </div>

        {/* One message carries the number AND its unit: as sibling nodes the text
            would be unmatchable ("82" + "%"), and the role="img" label is what
            tests and screen readers read. */}
        <div
          style={s.confidenceRow}
          role="img"
          aria-label={t("card.confidenceLabel", { pct })}
        >
          {t("card.confidence")}
          <span style={s.bar}>
            <span style={s.barFill(pct, confidenceColor(pct))} />
          </span>
          {t("card.confidencePct", { pct })}
        </div>
      </div>

      <div style={s.actions}>
        {editing ? (
          <>
            <Button kind="primary" onClick={save} disabled={!rule.trim() || busy}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              kind="primary"
              icon="Check"
              onClick={() => onStatus(candidate.id, "accepted")}
              disabled={busy || accepted}
            >
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind="ghost"
              icon="X"
              onClick={() => onStatus(candidate.id, "rejected")}
              disabled={busy || rejected}
            >
              {rejected ? t("card.rejected") : t("card.reject")}
            </Button>
            <div style={s.minorActions}>
              <Button kind="ghost" size="sm" icon="Edit" onClick={startEdit} disabled={busy}>
                {t("card.edit")}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                icon="Trash"
                onClick={() => {
                  if (window.confirm(t("card.deleteConfirm"))) onDelete(candidate.id);
                }}
                disabled={busy}
              >
                {t("card.delete")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
