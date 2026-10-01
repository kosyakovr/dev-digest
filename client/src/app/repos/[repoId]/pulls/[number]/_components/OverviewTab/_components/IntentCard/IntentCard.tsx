/* IntentCard — the PR Overview "Intent" card (L03): the derived statement, its
   in/out-of-scope lists, confidence, the sources used and a re-derive action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks";
import { formatCost } from "@/lib/format";
import { CONFIDENCE_COLOR } from "./constants";
import { sourcesSummary, unresolvedSummary, type UsedSource } from "./helpers";
import { s } from "./styles";

type Translate = ReturnType<typeof useTranslations>;

function sourceLabel(t: Translate, u: UsedSource): string {
  return u.ref ? t(`sources.${u.kind}`, { ref: u.ref }) : t(`sources.${u.kind}`);
}

function ScopeColumn({
  title,
  items,
  icon,
  color,
  none,
}: {
  title: string;
  items: string[];
  icon: "Check" | "X";
  color: string;
  none: string;
}) {
  const I = Icon[icon];
  return (
    <div style={s.column}>
      <div style={{ ...s.columnTitle, color }}>
        <I size={13} />
        <span>{title}</span>
      </div>
      {items.length === 0 ? (
        <div style={s.muted}>{none}</div>
      ) : (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IntentCard({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("intent");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) return <Skeleton height={140} />;
  if (isError) return <ErrorState title={t("loadError")} retryLabel={t("retry")} onRetry={() => refetch()} />;

  const intent = data?.intent ?? null;
  if (!intent) {
    return (
      <>
        <EmptyState
          icon="Target"
          title={t("empty")}
          body={t("emptyHint")}
          cta={derive.isPending ? t("deriving") : t("derive")}
          onCta={() => derive.mutate()}
          ctaLoading={derive.isPending}
        />
        {derive.isError && <div style={s.error}>{t("deriveError", { message: derive.error.message })}</div>}
      </>
    );
  }

  const summary = sourcesSummary(intent.sources);
  const unresolved = unresolvedSummary(intent.sources);
  const cost = formatCost(intent.cost_usd);

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerRight}>
            <Badge color={CONFIDENCE_COLOR[intent.confidence]}>{t(`confidence.${intent.confidence}`)}</Badge>
            {intent.stale && <Badge color="var(--warn)">{t("stale")}</Badge>}
            <IconBtn
              icon="RefreshCw"
              label={derive.isPending ? t("deriving") : t("rederive")}
              onClick={() => derive.mutate()}
              disabled={derive.isPending}
            />
          </div>
        }
      >
        {t("title")}
      </SectionLabel>
      <div style={s.card}>
        <p style={s.statement}>{intent.intent}</p>
        <div style={s.columns}>
          <ScopeColumn title={t("inScope")} items={intent.in_scope} icon="Check" color="var(--ok)" none={t("none")} />
          <ScopeColumn
            title={t("outOfScope")}
            items={intent.out_of_scope}
            icon="X"
            color="var(--text-muted)"
            none={t("none")}
          />
        </div>
        {intent.confidence === "low" && <div style={s.hint}>{t("lowHint")}</div>}
        <span style={s.muted}>
          {summary === "diffOnly"
            ? t("sources.diffOnly")
            : t("sources.label", { list: summary.map((u) => sourceLabel(t, u)).join(" · ") })}
        </span>
        {unresolved.length > 0 && (
          <span style={s.muted}>
            {t("unresolved", {
              list: unresolved.map((u) => `${u.ref ?? u.kind} (${t(`reason.${u.reason}`)})`).join(" · "),
            })}
          </span>
        )}
        {derive.isError && <div style={s.error}>{t("deriveError", { message: derive.error.message })}</div>}
        <div style={s.footer}>
          {cost ? t("meta", { model: intent.model, cost }) : intent.model}
        </div>
      </div>
    </section>
  );
}
