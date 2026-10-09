"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Onboarding, OnboardingSection, OnboardingSectionKind } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { isSectionEmpty, sectionBodyId, sectionId } from "../../helpers";
import { TourMarkdown } from "../TourMarkdown";
import { FileLinks } from "./_components/FileLinks";
import { RunSteps } from "./_components/RunSteps";
import { TaskCards } from "./_components/TaskCards";
import { s } from "./styles";

export function TourSection({
  section,
  tour,
  repoName,
  expanded,
  onToggle,
}: {
  section: OnboardingSection;
  tour: Onboarding;
  repoName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("onboarding");
  const empty = isSectionEmpty(section);
  const isTasks = section.kind === ("first_tasks" satisfies OnboardingSectionKind);
  const skeletonTasks = isTasks && tour.source === "skeleton";

  return (
    <section id={sectionId(section.kind)} style={s.card}>
      <button
        type="button"
        style={s.header}
        aria-expanded={expanded}
        aria-controls={sectionBodyId(section.kind)}
        onClick={onToggle}
      >
        <span style={s.title}>{section.title}</span>
        <Icon.ChevronDown size={16} style={expanded ? s.chevronOpen : s.chevron} />
      </button>
      <div id={sectionBodyId(section.kind)} hidden={!expanded} style={s.body}>
        {empty && <p style={s.muted}>{t("section.empty")}</p>}
        {!empty && skeletonTasks && <p style={s.muted}>{t("section.firstTasksSkeleton")}</p>}
        {!empty && !skeletonTasks && (
          <>
            <TourMarkdown>{section.body}</TourMarkdown>
            {section.diagram && <MermaidDiagram chart={section.diagram} />}
            <FileLinks links={section.links} repoName={repoName} sha={tour.indexed_sha} />
            <RunSteps steps={section.steps ?? []} />
            <TaskCards tasks={section.tasks ?? []} />
          </>
        )}
      </div>
    </section>
  );
}
