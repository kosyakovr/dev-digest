"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { useGeneratePrBrief, usePrBrief } from "@/lib/hooks";
import { IntentCard } from "./_components/IntentCard";
import { BlastCard } from "./_components/BlastCard";
import { BriefSection } from "./_components/BriefSection";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  repoId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
  prBody: string | null | undefined;
  /** Paths of the PR's changed files; a brief link to any other file is refused. */
  changedFiles: string[];
  reviews: ReviewRecord[];
  /** Open Files changed on a file (and a line, when the link has one). */
  onOpenFile: (file: string, line: number | null) => void;
}

export function OverviewTab({
  prId,
  repoId,
  repoFullName,
  headSha,
  prBody,
  changedFiles,
  reviews,
  onOpenFile,
}: OverviewTabProps) {
  const query = usePrBrief(prId);
  const generate = useGeneratePrBrief(prId);
  const [notInDiff, setNotInDiff] = React.useState(false);

  const state = query.data;
  const brief = state?.brief ?? null;
  const busy = generate.isPending || !!state?.generating;
  const showBrief = !!brief || busy;

  const open = (file: string, line: number | null) => {
    if (changedFiles.includes(file)) {
      setNotInDiff(false);
      onOpenFile(file, line);
    } else {
      setNotInDiff(true);
    }
  };

  return (
    <>
      <BriefSection
        state={state}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        pending={generate.isPending}
        generateError={generate.isError ? generate.error.message : null}
        onGenerate={() => generate.mutate()}
        reviews={reviews}
      />
      <div style={s.grid}>
        <IntentCard prId={prId}>
          {showBrief && (
            <RiskAreas risks={brief?.risks.risks ?? []} loading={busy} onOpenFile={(f) => open(f, null)} />
          )}
        </IntentCard>
        <BlastCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>
      {showBrief && (
        <ReviewFocus
          items={brief?.review_focus ?? []}
          loading={busy}
          notInDiff={notInDiff}
          onOpen={open}
        />
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
