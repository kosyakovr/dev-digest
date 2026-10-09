/* Skill editor → Context. The repo docs attached to this skill; every agent
   that uses the skill inherits them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocsEditor } from "@/components/context-docs/ContextDocsEditor";
import { useSkillContext, useSetSkillContext } from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillContext(skill.id);
  const save = useSetSkillContext();

  if (isError) return <ErrorState body={t("loadError")} onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton height={180} />;

  return (
    <ContextDocsEditor
      items={data.items}
      note={t("editor.skillNote")}
      saving={save.isPending}
      onSave={(items) =>
        save.mutate(
          { skillId: skill.id, items },
          {
            onSuccess: () => toast.success(t("editor.savedToast")),
            onError: () => toast.error(t("editor.saveError")),
          },
        )
      }
    />
  );
}
