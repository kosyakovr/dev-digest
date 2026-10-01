"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { RoleGroup } from "./_components/RoleGroup";
import { planGroups, visibleFindings } from "./helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const smart = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    findings: visibleFindings(reviews, smart.data?.review_ids ?? []),
    pendingId: action.isPending ? (action.variables?.findingId ?? null) : null,
    onAction: (findingId, act) => action.mutate({ findingId, action: act, prId: prId ?? undefined }),
  };

  const groups = smart.data ? planGroups(smart.data, files) : null;

  let body: React.ReactNode;
  if (files.length === 0) {
    body = <DiffViewer files={files} commenting={commenting} />;
  } else if (smart.isLoading) {
    body = <Skeleton />;
  } else if (smart.isError || !smart.data || !groups) {
    body = (
      <>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
          {t("smartDiff.unavailable")}
        </p>
        <DiffViewer files={files} commenting={commenting} />
      </>
    );
  } else {
    body = (
      <>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
          {t("smartDiff.groupedByRole")}
        </p>
        {smart.data.review_ids.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
            {t("smartDiff.noReview")}
          </p>
        )}
        {groups.map((g) => (
          <RoleGroup
            key={g.role}
            role={g.role}
            files={g.files}
            filesWithFindings={g.filesWithFindings}
            commenting={commenting}
            findings={findingApi}
          />
        ))}
      </>
    );
  }

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {body}
    </section>
  );
}
