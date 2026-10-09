/* Agent editor → Context. The repo docs attached to this agent, in prompt
   order, plus the docs it inherits from its skills. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocsEditor } from "@/components/context-docs/ContextDocsEditor";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/context";
import { useToast } from "@/lib/toast";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useAgentContext(agent.id);
  const save = useSetAgentContext();

  if (isError) return <ErrorState body={t("loadError")} onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton height={180} />;

  return (
    <ContextDocsEditor
      items={data.items}
      inherited={data.inherited}
      saving={save.isPending}
      onSave={(items) =>
        save.mutate(
          { agentId: agent.id, items },
          {
            onSuccess: () => toast.success(t("editor.savedToast")),
            onError: () => toast.error(t("editor.saveError")),
          },
        )
      }
    />
  );
}
