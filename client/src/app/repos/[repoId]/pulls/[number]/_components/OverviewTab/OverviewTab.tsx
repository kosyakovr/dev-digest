"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastCard } from "./_components/BlastCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  repoId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, repoId, repoFullName, headSha, prBody }: OverviewTabProps) {
  return (
    <>
      <div style={s.grid}>
        <IntentCard prId={prId} />
        <BlastCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
