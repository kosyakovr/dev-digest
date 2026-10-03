/* HistoryAccordion — "Prior PRs touching these files": collapsed by default,
   count badge in the header, rows read from GET /pulls/:id/history. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, MonoLink, Skeleton } from "@devdigest/ui";
import type { PrHistoryItem } from "@devdigest/shared";
import { usePrHistory } from "@/lib/hooks";
import { githubPrUrl } from "@/lib/github-urls";
import { s } from "./styles";

function PriorPrRow({ item, repoFullName }: { item: PrHistoryItem; repoFullName: string | null | undefined }) {
  const t = useTranslations("blast");
  const label = `#${item.pr_number}`;
  return (
    <div style={s.row}>
      <div style={s.rowTop}>
        {repoFullName ? (
          <MonoLink href={githubPrUrl(repoFullName, item.pr_number)}>{label}</MonoLink>
        ) : (
          <span className="mono">{label}</span>
        )}
        <span style={s.title}>{item.title}</span>
      </div>
      <div style={s.meta}>
        <span>
          {item.author} · {t("history.merged", { date: new Date(item.merged_at).toLocaleDateString() })}
        </span>
        <span title={item.files_overlap.join("\n")}>
          {t("history.overlap", { count: item.files_overlap.length })}
        </span>
      </div>
      {item.notes && <div style={s.notes}>{item.notes}</div>}
    </div>
  );
}

export function HistoryAccordion({
  prId,
  repoFullName,
}: {
  prId: string | null | undefined;
  repoFullName: string | null | undefined;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError, refetch } = usePrHistory(prId);

  return (
    <div>
      <button type="button" style={s.header} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon.History size={14} />
        <span>{t("history.title")}</span>
        {data && <Badge><span aria-label={t("history.count", { count: data.history.length })}>{data.history.length}</span></Badge>}
        <Icon.ChevronDown size={14} style={{ ...s.chevron, transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div style={s.body}>
          {isLoading && <Skeleton height={48} />}
          {isError && !data && (
            <ErrorState title={t("history.loadError")} retryLabel={t("retry")} onRetry={() => refetch()} />
          )}
          {data?.degraded && data.reason && <div style={s.notice}>{t(`history.degraded.${data.reason}`)}</div>}
          {data && data.history.length === 0 && !data.degraded && <div style={s.muted}>{t("history.empty")}</div>}
          {data?.history.map((item) => (
            <PriorPrRow key={item.pr_number} item={item} repoFullName={repoFullName} />
          ))}
        </div>
      )}
    </div>
  );
}
