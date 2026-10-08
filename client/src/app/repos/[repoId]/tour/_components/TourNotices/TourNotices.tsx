"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Onboarding } from "@devdigest/shared";
import { SKELETON_REASON_KEYS } from "../../constants";
import { shortSha, unavailableReason } from "../../helpers";
import { s } from "./styles";

export function TourNotices({
  tour,
  stale,
  currentSha,
  pending,
  onRegenerate,
}: {
  tour: Onboarding;
  stale: boolean;
  currentSha: string | null;
  pending: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");

  let skeleton: string | null = null;
  if (tour.source === "skeleton") {
    if (tour.skeleton_reason === "index_unavailable") {
      skeleton = t("notice.indexUnavailable", {
        reason: t(`notice.reason.${unavailableReason(tour.index_reason)}`),
      });
    } else if (tour.skeleton_reason) {
      skeleton = t(SKELETON_REASON_KEYS[tour.skeleton_reason]);
    }
  }

  return (
    <>
      {skeleton && (
        <div role="status" style={s.notice}>
          <span>{skeleton}</span>
          <Button kind="secondary" size="sm" onClick={onRegenerate} disabled={pending}>
            {t("regenerate")}
          </Button>
        </div>
      )}
      {tour.index_status === "partial" && (
        <div role="status" style={s.notice}>
          <span>{t("notice.partial")}</span>
        </div>
      )}
      {stale && currentSha && (
        <div role="status" style={s.notice}>
          <span>
            {t("notice.stale", { tourSha: shortSha(tour.indexed_sha), currentSha: shortSha(currentSha) })}
          </span>
        </div>
      )}
    </>
  );
}
