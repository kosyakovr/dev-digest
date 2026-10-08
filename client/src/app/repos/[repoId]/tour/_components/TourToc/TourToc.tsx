"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import { s } from "./styles";

export function TourToc({
  sections,
  onSelect,
}: {
  sections: OnboardingSection[];
  onSelect: (kind: string) => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("toc")} style={s.toc}>
      <div style={s.label}>{t("toc")}</div>
      <div style={s.list}>
        {sections.map((section) => (
          <button key={section.kind} type="button" style={s.entry} onClick={() => onSelect(section.kind)}>
            {section.title}
          </button>
        ))}
      </div>
    </nav>
  );
}
