/* Conventions board — /repos/:repoId/conventions (L02).
   Scan the repo for the house rules it already follows, triage them, and turn
   the selected ones into a skill. Every candidate shown here survived the
   server's evidence gate, so its snippet is real code from the cited file. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import {
  useConventions,
  useDeleteConvention,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { FILTER_KEYS, type FilterKey } from "./constants";
import { countByStatus, filterByStatus, pruneSelection, toggleSelected } from "./helpers";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { s } from "./styles";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const toast = useToast();
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();
  const remove = useDeleteConvention();

  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [modalIds, setModalIds] = React.useState<string[] | null>(null);

  const list = React.useMemo(() => candidates ?? [], [candidates]);

  // A re-scan swaps the pending rows out, so a selection made before it would
  // point at candidates that no longer exist.
  React.useEffect(() => {
    setSelected((prev) => {
      const next = pruneSelection(prev, list);
      return next.size === prev.size ? prev : next;
    });
  }, [list]);

  const counts = countByStatus(list);
  const shown = filterByStatus(list, filter);
  const scan = extract.data;

  const runScan = async () => {
    try {
      await extract.mutateAsync(repoId);
    } catch {
      toast.error(t("page.extractionFailed"));
    }
  };

  const onStatus = (id: string, status: ConventionStatus) =>
    update.mutate({ id, repoId, patch: { status } });
  const onEdit = (id: string, patch: { rule: string; rationale: string | null }) =>
    update.mutate({ id, repoId, patch });
  const onDelete = (id: string) => remove.mutate({ id, repoId });

  if (repoNotFound) return <RepoNotFound />;

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");

  return (
    <AppShell crumb={crumb}>
      {modalIds && (
        <CreateSkillModal repoId={repoId} ids={modalIds} onClose={() => setModalIds(null)} />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              {repoName}
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <Button
            kind="primary"
            size="sm"
            icon="Zap"
            onClick={runScan}
            disabled={extract.isPending}
          >
            {extract.isPending
              ? t("page.scanning")
              : list.length > 0
                ? t("page.rescan")
                : t("page.runExtraction")}
          </Button>
        </div>

        {scan && (
          <div style={s.summary} role="status">
            <span style={s.summaryLabel}>{t("summary.heading")}</span>
            <span>{t("summary.proposed", { count: scan.proposed })}</span>
            <span style={s.summaryDot}>·</span>
            <span>{t("summary.droppedUngrounded", { count: scan.dropped_ungrounded })}</span>
            <span style={s.summaryDot}>·</span>
            <span>{t("summary.droppedDuplicate", { count: scan.dropped_duplicate })}</span>
            <span style={s.summaryDot}>·</span>
            <span>{t("summary.sampled", { count: scan.sampled_files })}</span>
            <span style={s.summaryDot}>·</span>
            <span>
              {scan.cost_usd == null
                ? t("summary.costUnknown", { model: scan.model })
                : t("summary.cost", { model: scan.model, cost: scan.cost_usd.toFixed(4) })}
            </span>
          </div>
        )}

        {isLoading ? (
          <div style={s.list}>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        ) : isError ? (
          <ErrorState title={t("page.loadError")} onRetry={() => void refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={runScan}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <div style={s.chips}>
                {FILTER_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    style={s.chip(filter === key)}
                    onClick={() => setFilter(key)}
                  >
                    {t(`filters.${key}`, { count: counts[key] })}
                  </button>
                ))}
              </div>
              <span style={s.selectionCount}>
                {t("selection.count", { count: selected.size })}
              </span>
              <Button
                kind="primary"
                size="sm"
                icon="Sparkles"
                disabled={selected.size === 0}
                onClick={() => setModalIds([...selected])}
              >
                {t("selection.createSkill")}
              </Button>
            </div>

            <p style={s.selectionCount}>{t("page.candidateCount", { count: list.length })}</p>

            {shown.length === 0 ? (
              <div style={s.filterEmpty}>{t("filters.emptyForFilter")}</div>
            ) : (
              <div style={s.list}>
                {shown.map((c) => (
                  <ConventionCard
                    key={c.id}
                    candidate={c}
                    selected={selected.has(c.id)}
                    onToggleSelected={(id) => setSelected((prev) => toggleSelected(prev, id))}
                    onStatus={onStatus}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    repoFullName={activeRepo?.full_name}
                    repoBranch={activeRepo?.default_branch}
                    busy={update.isPending || remove.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
