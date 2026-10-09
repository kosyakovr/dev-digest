"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Onboarding } from "@devdigest/shared";
import { s } from "./styles";

export function TourHeader({
  repoName,
  tour,
  pending,
  elapsed,
  onRegenerate,
  buttonRef,
}: {
  repoName: string;
  tour: Onboarding;
  pending: boolean;
  /** Seconds since this page's own request started; null when it has none. */
  elapsed: number | null;
  onRegenerate: () => void;
  /** Wraps the Regenerate button so the dialog can return focus to it. */
  buttonRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const t = useTranslations("onboarding");
  const time = new Date(tour.generated_at).toLocaleString();
  const meta =
    tour.source === "llm" && tour.model
      ? t("header.metaModel", { files: tour.files_indexed, time, model: tour.model })
      : t("header.meta", { files: tour.files_indexed, time });

  return (
    <div style={s.header}>
      <div style={s.text}>
        <h1 style={s.h1}>{t("header.title", { repo: repoName })}</h1>
        <p style={s.meta}>{meta}</p>
      </div>
      <div style={s.actions}>
        <span ref={buttonRef}>
          <Button kind="primary" size="sm" icon="RefreshCw" onClick={onRegenerate} disabled={pending}>
            {pending ? t("regenerating") : t("regenerate")}
          </Button>
        </span>
        {pending && <div style={s.hint}>{t("pendingHint")}</div>}
        {elapsed != null && <div style={s.hint}>{t("elapsed", { seconds: elapsed })}</div>}
      </div>
    </div>
  );
}
