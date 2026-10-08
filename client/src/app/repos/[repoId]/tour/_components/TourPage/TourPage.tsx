"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { TourView } from "../TourView";

/** The interactive leaf of the route: reads the repo id, gates on "not found", wraps the view in the shell. */
export function TourPage() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const repoNotFound = useRepoNotFound(repoId);

  if (repoNotFound) return <RepoNotFound />;

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <TourView repoId={repoId} />
    </AppShell>
  );
}
