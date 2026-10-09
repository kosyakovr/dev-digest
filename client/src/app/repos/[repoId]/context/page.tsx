/* Project Context — /repos/:repoId/context (L05).
   Browse the repo's markdown docs under the configured source folders, with
   their token sizes, and preview one. Attaching docs happens in the agent and
   skill editors. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { DocPreview } from "@/components/context-docs/DocPreview";
import { ApiError } from "@/lib/api";
import { useRepoNotFound } from "@/lib/repo-context";
import { useContextFile, useContextFiles, useContextSources } from "@/lib/hooks/context";
import { DocList } from "./_components/DocList";
import { s } from "./styles";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const repoNotFound = useRepoNotFound(repoId);

  const { data: docs, isLoading, isError, error, refetch } = useContextFiles(repoId);
  const { data: sources } = useContextSources();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const file = useContextFile(repoId, selected);

  if (repoNotFound) return <RepoNotFound />;

  // A 422 carries the server's own words ("not cloned yet"); anything else is generic.
  const body = error instanceof ApiError && error.status === 422 ? error.message : undefined;

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("title")}</h1>
        {isLoading ? (
          <Skeleton height={240} />
        ) : isError ? (
          <ErrorState body={body ?? t("loadError")} onRetry={body ? undefined : () => refetch()} />
        ) : !docs || docs.length === 0 ? (
          <EmptyState
            icon="FileText"
            title={t("empty.title")}
            body={t("empty.body", { folders: (sources?.folders ?? []).join(", ") })}
          />
        ) : (
          <div style={s.split}>
            <DocList docs={docs} selected={selected} filter={filter} onFilter={setFilter} onSelect={setSelected} />
            <div style={s.pane}>
              {selected ? (
                <DocPreview doc={file.data} loading={file.isLoading} error={file.isError} />
              ) : (
                <div style={s.hint}>{t("selectDoc")}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
