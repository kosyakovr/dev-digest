/* BriefSection — the "PR Brief" block at the top of the Overview: empty state,
   loading, load error, or the stored brief on an extended VerdictBanner. The
   brief data and the generate mutation live in OverviewTab (nearest common owner). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatCost, shortSha } from "@/lib/format";
import type { PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import { VerdictBanner } from "@/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner";
import { blockerCount, latestVerdictReview } from "../../helpers";
import { s } from "./styles";

const ELAPSED_TICK_MS = 1_000;

export function BriefSection({
  state,
  isLoading,
  isError,
  onRetry,
  pending,
  generateError,
  onGenerate,
  reviews,
}: {
  state: PrBriefResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** This page's own POST is in flight. */
  pending: boolean;
  generateError: string | null;
  onGenerate: () => void;
  reviews: ReviewRecord[];
}) {
  const t = useTranslations("brief");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);

  // The elapsed counter runs only for this page's own request (AC-60, AC-61).
  React.useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    setSeconds(0);
    const id = setInterval(() => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000))), ELAPSED_TICK_MS);
    return () => clearInterval(id);
  }, [pending]);

  const brief = state?.brief ?? null;
  const busy = pending || !!state?.generating;

  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton height={90} />;
  } else if (isError && !state) {
    body = <ErrorState title={t("loadError")} retryLabel={t("retry")} onRetry={onRetry} />;
  } else if (busy) {
    body = (
      <VerdictBanner
        summary={null}
        loading
        footer={
          <div style={s.status}>
            <span role="status">{t("generating")}</span>
            {pending && <span>{t("elapsed", { seconds })}</span>}
          </div>
        }
      />
    );
  } else if (!brief) {
    body = (
      <EmptyState
        icon="Target"
        title={t("empty.title")}
        body={t("empty.body")}
        cta={t("generate")}
        onCta={onGenerate}
      />
    );
  } else {
    const review = latestVerdictReview(reviews);
    const cost = formatCost(brief.generation.cost_usd);
    const { blast, history } = brief;
    body = (
      <>
        <VerdictBanner
          verdict={review?.verdict ?? null}
          summary={brief.summary}
          score={review?.score ?? null}
          findingsCount={review?.findings.length}
          blockers={review ? blockerCount(review.findings) : 0}
          agentName={review?.agent_name ?? null}
          provenance={t("provenance")}
          onRegenerate={() => setConfirmOpen(true)}
          regenerateLabel={t("regenerate")}
          footer={
            <div style={s.meta}>
              {t("meta", { model: brief.generation.model, cost: cost ?? t("costUnknown") })}
            </div>
          }
        />
        {state?.stale && <div style={s.notice}>{t("stale", { sha: shortSha(brief.generation.head_sha) })}</div>}
        {blast.degraded && <div style={s.notice}>{t("degraded.blast", { reason: blast.reason ?? "" })}</div>}
        {history.degraded && <div style={s.notice}>{t("degraded.history", { reason: history.reason ?? "" })}</div>}
      </>
    );
  }

  return (
    <section style={s.wrap}>
      <SectionLabel icon="FileText">{t("section")}</SectionLabel>
      {body}
      {generateError && (
        <div role="alert" style={s.error}>
          {t("generateError", { message: generateError })}
        </div>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title={t("confirm.title")}
          body={t("confirm.body")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          onConfirm={() => {
            setConfirmOpen(false);
            onGenerate();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </section>
  );
}
