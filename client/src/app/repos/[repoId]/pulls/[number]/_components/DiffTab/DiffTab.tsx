"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type DiffTarget } from "@/components/diff-viewer";
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
import { DiffToolbar, type DiffOrder } from "./_components/DiffToolbar";
import { planGroups, visibleFindings } from "./helpers";
import { note } from "./styles";

interface DiffTabProps {
  prId: string | null;
  /** PR-level totals from GitHub (cover every file, even when `files` is capped). */
  filesCount: number;
  additions: number;
  deletions: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Deep link (`?file=&line=`): open, scroll to and mark this file and line. */
  target?: DiffTarget | null;
}

export function DiffTab({ prId, filesCount, additions, deletions, files, canComment, target }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const smart = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

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
  const noReview =
    !!smart.data && !smart.isError && smart.data.review_ids.length === 0 ? (
      <p style={note}>{t("smartDiff.noReview")}</p>
    ) : null;
  // Findings are the reviews the smart diff names (review_ids), so without its
  // data there are none to show in either order — say so rather than render a
  // silently bare diff.
  const findingsUnavailable =
    smart.isError && !smart.data ? <p style={note}>{t("smartDiff.findingsUnavailable")}</p> : null;
  // The flat list in the PR's own order — Original order, and Smart order's fallback.
  const flat = <DiffViewer files={files} commenting={commenting} findings={findingApi} target={target} />;

  let body: React.ReactNode;
  if (files.length === 0) {
    body = <DiffViewer files={files} commenting={commenting} />; // no files: nothing to target
  } else if (order === "original") {
    body = (
      <>
        {noReview}
        {flat}
      </>
    );
  } else if (smart.isLoading) {
    body = (
      <div role="status" aria-label={t("smartDiff.loading")}>
        <Skeleton />
      </div>
    );
  } else if (smart.isError || !smart.data || !groups) {
    body = (
      <>
        <p style={note}>{t("smartDiff.unavailable")}</p>
        {flat}
      </>
    );
  } else {
    body = (
      <>
        {noReview}
        {groups.map((g) => (
          <RoleGroup
            key={g.role}
            role={g.role}
            files={g.files}
            filesWithFindings={g.filesWithFindings}
            commenting={commenting}
            findings={findingApi}
            target={target}
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
        Files changed
      </SectionLabel>
      {files.length > 0 && (
        <DiffToolbar
          filesCount={filesCount}
          additions={additions}
          deletions={deletions}
          order={order}
          onOrderChange={setOrder}
        />
      )}
      {files.length > 0 && findingsUnavailable}
      {body}
    </section>
  );
}
