"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useActiveRepo } from "@/lib/repo-context";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { ELAPSED_TICK_MS } from "../../constants";
import { elapsedSeconds, sectionId } from "../../helpers";
import { RegenerateDialog } from "../RegenerateDialog";
import { TourHeader } from "../TourHeader";
import { TourNotices } from "../TourNotices";
import { TourSection } from "../TourSection";
import { TourToc } from "../TourToc";
import { s } from "../../styles";

export function TourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const { repos } = useActiveRepo();
  const fullName = repos.find((r) => r.id === repoId)?.full_name ?? "";

  const query = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour();

  // Lifted here so "On this page" can expand a card (AC-29). All start expanded.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(0);
  const inFlight = React.useRef(false);
  const regenerateRef = React.useRef<HTMLSpanElement>(null);

  const ownPending = generate.isPending;
  React.useEffect(() => {
    if (!ownPending || startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(id);
  }, [ownPending, startedAt]);

  const state = query.data;
  const tour = state?.tour ?? null;
  const pending = ownPending || !!state?.generating;
  // The counter belongs to this page's own request only (AC-51, AC-52).
  const elapsed =
    ownPending && startedAt != null ? elapsedSeconds(startedAt, Math.max(now, startedAt)) : null;

  const start = () => {
    if (inFlight.current || generate.isPending) return;
    inFlight.current = true;
    const at = Date.now();
    setStartedAt(at);
    setNow(at);
    generate.mutate(repoId, {
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  const onRegenerate = () => {
    if (tour?.source === "llm") setConfirmOpen(true);
    else start();
  };

  const focusRegenerate = () => regenerateRef.current?.querySelector("button")?.focus();
  const closeDialog = () => {
    setConfirmOpen(false);
    focusRegenerate();
  };
  const confirmDialog = () => {
    setConfirmOpen(false);
    start();
  };

  const toggle = (kind: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const goTo = (kind: string) => {
    setCollapsed((prev) => {
      if (!prev.has(kind)) return prev;
      const next = new Set(prev);
      next.delete(kind);
      return next;
    });
    document.getElementById(sectionId(kind))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (notFound) {
    return (
      <div style={s.page}>
        <ErrorState title={t("notFound")} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div style={s.page}>
        <ErrorState title={t("loadError.title")} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (query.isLoading) {
    return (
      <div style={s.page}>
        <div style={s.center}>{t("loading")}</div>
      </div>
    );
  }

  if (!tour) {
    return (
      <div style={s.page}>
        <EmptyState title={t("generate.title")} body={t("generate.body")} />
        <div style={s.pendingBlock}>
          <Button kind="secondary" icon="Zap" onClick={start} disabled={pending}>
            {pending ? t("generate.generating") : t("generate.cta")}
          </Button>
          {pending && <div style={s.hint}>{t("pendingHint")}</div>}
          {elapsed != null && <div style={s.hint}>{t("elapsed", { seconds: elapsed })}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <TourHeader
        repoName={fullName}
        tour={tour}
        pending={pending}
        elapsed={elapsed}
        onRegenerate={onRegenerate}
        buttonRef={regenerateRef}
      />
      <TourNotices
        tour={tour}
        stale={!!state?.stale}
        currentSha={state?.current_indexed_sha ?? null}
        pending={pending}
        onRegenerate={onRegenerate}
      />
      <TourToc sections={tour.sections} onSelect={goTo} />
      <div style={s.sections}>
        {tour.sections.map((section) => (
          <TourSection
            key={section.kind}
            section={section}
            tour={tour}
            repoName={fullName}
            expanded={!collapsed.has(section.kind)}
            onToggle={() => toggle(section.kind)}
          />
        ))}
      </div>
      {confirmOpen && <RegenerateDialog onConfirm={confirmDialog} onCancel={closeDialog} />}
    </div>
  );
}
