/* BlastCard — the PR Overview "Blast radius" card: counters, Tree/Graph, a
   degraded notice with a re-index action, and the Prior PRs accordion. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { useBlastResync, usePrBlast } from "@/lib/hooks";
import { blastCounts, linkSha } from "./helpers";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { HistoryAccordion } from "./_components/HistoryAccordion";
import { s } from "./styles";

type View = "tree" | "graph";

interface BlastCardProps {
  prId: string | null | undefined;
  repoId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

function DegradedNotice({
  reason,
  repoId,
  prId,
}: {
  reason: NonNullable<BlastRadius["reason"]> | undefined;
  repoId: string | null | undefined;
  prId: string | null | undefined;
}) {
  const t = useTranslations("blast");
  const resync = useBlastResync(repoId, prId);
  return (
    <div role="status" style={s.notice}>
      <span style={s.noticeText}>{t(`degraded.${reason ?? "no_data"}`)}</span>
      {reason !== "flag_off" && (
        <Button kind="secondary" size="sm" icon="RefreshCw" loading={resync.running} onClick={resync.start}>
          {resync.running ? t("resyncing") : t("resync")}
        </Button>
      )}
      {resync.timedOut && <span style={s.noticeText}>{t("resyncTimeout")}</span>}
      {resync.error && <span style={s.error}>{t("resyncError", { message: resync.error.message })}</span>}
    </div>
  );
}

export function BlastCard({ prId, repoId, repoFullName, headSha }: BlastCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = usePrBlast(prId);
  const [view, setView] = React.useState<View>("tree");

  if (isLoading) return <Skeleton height={160} />;
  if (isError && !data)
    return <ErrorState title={t("loadError")} retryLabel={t("retry")} onRetry={() => refetch()} />;
  if (!data) return null;

  const counts = blastCounts(data);
  const sha = linkSha(data, headSha);
  const hasDownstream = data.downstream.length > 0;

  return (
    <section style={{ minWidth: 0 }}>
      <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
      <Card>
        <div style={s.card}>
          <div style={s.counts}>
            <Badge>{t("count.symbols", { count: counts.symbols })}</Badge>
            <Badge>{t("count.callers", { count: counts.callers })}</Badge>
            <Badge>{t("count.endpoints", { count: counts.endpoints })}</Badge>
            <Badge>{t("count.crons", { count: counts.crons })}</Badge>
          </div>
          {data.degraded && <DegradedNotice reason={data.reason} repoId={repoId} prId={prId} />}
          <div style={s.toggle}>
            <Button kind="secondary" size="sm" active={view === "tree"} aria-pressed={view === "tree"} onClick={() => setView("tree")}>
              {t("view.tree")}
            </Button>
            <Button kind="secondary" size="sm" active={view === "graph"} aria-pressed={view === "graph"} onClick={() => setView("graph")}>
              {t("view.graph")}
            </Button>
          </div>
          {view === "graph" ? (
            <BlastGraph downstream={data.downstream} repoFullName={repoFullName} sha={sha} />
          ) : hasDownstream ? (
            <BlastTree downstream={data.downstream} repoFullName={repoFullName} sha={sha} />
          ) : (
            !data.degraded && <div style={s.muted}>{t("noDownstream", { count: data.changed_symbols.length })}</div>
          )}
          <hr style={s.divider} />
          <HistoryAccordion prId={prId} repoFullName={repoFullName} />
        </div>
      </Card>
    </section>
  );
}
