import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import type { FindingRow } from '../../db/rows.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus, rollupSeverities, toFindingPreviews } from './status.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await container.github();
    } catch (err) {
      app.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await container.db
            .insert(t.pullRequests)
            .values({
              workspaceId,
              repoId: repo.id,
              number: pr.number,
              title: pr.title,
              author: pr.author,
              branch: pr.branch,
              base: pr.base,
              headSha: pr.head_sha,
              additions: pr.additions,
              deletions: pr.deletions,
              filesCount: pr.files_count,
              status: pr.status,
              openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
              updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
            })
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: pr.title,
                headSha: pr.head_sha,
                status: pr.status,
                updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
              },
            });
        }
      } catch (err) {
        app.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    const BACKFILL_LIMIT = 10;
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await container.db
            .update(t.pullRequests)
            .set({
              additions: detail.additions,
              deletions: detail.deletions,
              filesCount: detail.files_count,
            })
            .where(eq(t.pullRequests.id, r.id));
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          app.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap. The review's `id` comes along so the FINDINGS rollup
    // below reads the SAME row — score and findings can never disagree.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { id: string; score: number | null }>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) {
          latestReviewByPr.set(rv.prId, { id: rv.id, score: rv.score });
        }
      }
    }

    // Latest-review FINDINGS per PR, for the list's FINDINGS column and its
    // hover popover. ONE IN-query over the latest reviews' ids (not one per PR —
    // no N+1), then grouped in JS, exactly like the score above.
    //
    // The full findings are NOT shipped to the list: only a severity tally plus
    // a capped, read-only preview. The whole list, the markdown rationale and
    // the acting UI (accept / dismiss) stay on the PR detail page. The column
    // describes the LATEST run only — which is what the popover title,
    // "N FINDINGS IN THIS RUN", promises.
    const findingsByReview = new Map<string, FindingRow[]>();
    const latestReviewIds = [...latestReviewByPr.values()].map((rv) => rv.id);
    if (latestReviewIds.length > 0) {
      const findingRows = await container.db
        .select()
        .from(t.findings)
        .where(inArray(t.findings.reviewId, latestReviewIds));
      for (const f of findingRows) {
        const list = findingsByReview.get(f.reviewId);
        if (list) list.push(f);
        else findingsByReview.set(f.reviewId, [f]);
      }
    }

    // Lifetime run COST per PR for the list's cost column — every agent_runs
    // row on the PR, any status, because that money was spent either way. Same
    // one-IN-query + grouping shape as the score above (no N+1).
    //
    // NULL-cost runs (unpriced model, or a failure before the first LLM call)
    // are SKIPPED by SUM, so a mixed PR yields a partial total that understates
    // — deliberate: the per-run breakdown on the PR page shows which runs are
    // unknown. A PR with no runs, or whose runs are all NULL, yields null (not
    // 0), so the UI can render "—" instead of claiming the PR was free.
    const costByPr = new Map<string, number>();
    if (prIds.length > 0) {
      const costRows = await container.db
        .select({
          prId: t.agentRuns.prId,
          cost: sql<number | string | null>`sum(${t.agentRuns.costUsd})`,
        })
        .from(t.agentRuns)
        .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, prIds)))
        .groupBy(t.agentRuns.prId);
      for (const c of costRows) {
        // SUM over an all-NULL group is NULL, not 0 — keep it out of the map.
        if (c.prId != null && c.cost != null) costByPr.set(c.prId, Number(c.cost));
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      const reviewFindings = review ? findingsByReview.get(review.id) ?? [] : [];
      const sev = rollupSeverities(reviewFindings);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        // No review at all ⇒ null (the cell renders "—"). A review that found
        // nothing ⇒ an all-zero rollup, which is a different fact and renders 0.
        latest_findings: review
          ? {
              total: reviewFindings.length,
              by_severity: {
                CRITICAL: sev.critical,
                WARNING: sev.warning,
                SUGGESTION: sev.suggestion,
              },
              preview: toFindingPreviews(reviewFindings),
            }
          : null,
      };
    });
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)),
      );
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      if (detail.files.length > 0) {
        await container.db.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId: pr.id,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await container.db.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      if (detail.commits.length > 0) {
        await container.db.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId: pr.id,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await container.db
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, pr.id));

      return { ...detail, id: pr.id };
    } catch (err) {
      app.log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      const commits = await container.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  });

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.
  async function resolvePrAndRepo(id: string, workspaceId: string) {
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch (err) {
        app.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
        return [];
      }
      try {
        return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
      } catch (err) {
        app.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
        return [];
      }
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      const input = req.body;
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch {
        throw new AppError(
          'github_unavailable',
          'Connect a GitHub token to post comments.',
          400,
        );
      }
      try {
        return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
          commitId: pr.headSha,
          path: input.path,
          line: input.line,
          ...(input.side ? { side: input.side } : {}),
          body: input.body,
          ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
        });
      } catch (err) {
        // GitHub rejects comments on lines outside the diff / on closed PRs (422).
        const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
        throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
      }
    },
  );
}
