/* RoleGroup — one smart-diff role group on the Files changed tab: a collapsible
   header (label, files-with-findings count, file count) over a DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { COLLAPSED_BY_DEFAULT, ROLE_LABEL_KEY } from "./constants";
import { rs } from "./styles";

interface RoleGroupProps {
  role: SmartDiffRole;
  files: PrFile[];
  filesWithFindings: number;
  commenting: DiffCommentApi;
  findings: DiffFindingApi;
}

export function RoleGroup({ role, files, filesWithFindings, commenting, findings }: RoleGroupProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.has(role));

  return (
    <div style={rs.group}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={rs.header}>
        <Icon.ChevronRight size={13} style={rs.chevron(open)} />
        <span style={rs.label}>{t(ROLE_LABEL_KEY[role])}</span>
        {filesWithFindings > 0 && (
          <span
            role="img"
            aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindings })}
            style={{ ...rs.findingsDot, color: SEV.CRITICAL.c }}
          >
            ● {filesWithFindings}
          </span>
        )}
        <span style={rs.count}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findings={findings} />}
    </div>
  );
}
