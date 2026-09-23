/* Versions tab — the body history, newest first, with Diff and Restore.

   Restore is destructive: it discards every newer version. The confirmation
   here is the only thing standing between a click and that deletion, so it
   names the version explicitly. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useRestoreSkillVersion,
  useSkillVersions,
} from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { diffLines, diffStat } from "../../../../../helpers";
import { DIFF_SIGN, previousVersion } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [openDiff, setOpenDiff] = React.useState<number | null>(null);

  if (isLoading) return <Skeleton height={160} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const list = [...(versions ?? [])].sort((a, b) => b.version - a.version);

  const onRestore = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: () => {
          setOpenDiff(null);
          toast.success(t("versions.restoredToast", { version }));
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">
          {t("versions.label", { version: skill.version })}
        </Badge>
      </div>
      <p style={s.hint}>{t("versions.hint")}</p>

      {list.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}

      <div style={s.list}>
        {list.map((v) => {
          const isCurrent = v.version === skill.version;
          const prev = previousVersion(list, v.version);
          const showDiff = openDiff === v.version;
          const rows = showDiff && prev ? diffLines(prev.body, v.body) : [];
          const stat = diffStat(rows);

          return (
            <div
              key={v.version}
              role="group"
              aria-label={t("versions.label", { version: v.version })}
              style={s.card(isCurrent)}
            >
              <div style={s.cardHeader}>
                <span style={s.version}>{t("versions.label", { version: v.version })}</span>
                {isCurrent && <Badge color="var(--accent-text)">{t("versions.current")}</Badge>}
                <span className="mono" style={s.timestamp}>
                  {new Date(v.created_at).toLocaleString()}
                </span>
                <div style={s.actions}>
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="GitCommit"
                    onClick={() => setOpenDiff(showDiff ? null : v.version)}
                    disabled={!prev}
                    title={prev ? undefined : t("versions.initial")}
                  >
                    {showDiff ? t("versions.hideDiff") : t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="RefreshCw"
                    onClick={() => onRestore(v.version)}
                    disabled={isCurrent || restore.isPending}
                  >
                    {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                </div>
              </div>

              {showDiff && prev && (
                <div style={s.diffPanel}>
                  <div style={s.diffCaption}>
                    <span>
                      {t("versions.diffCaption", { from: prev.version, to: v.version })}
                    </span>
                    {stat.added === 0 && stat.removed === 0 ? (
                      <span>{t("versions.noChanges")}</span>
                    ) : (
                      <>
                        <span style={s.stat("var(--ok)")}>+{stat.added}</span>
                        <span style={s.stat("var(--crit)")}>−{stat.removed}</span>
                      </>
                    )}
                  </div>
                  <div style={s.diffBody}>
                    {rows.map((r, i) => (
                      <div key={i} className="mono" style={s.diffRow(r.op)}>
                        <span style={s.diffSign}>{DIFF_SIGN[r.op]}</span>
                        <span>{r.text || " "}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
