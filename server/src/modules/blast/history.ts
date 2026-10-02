import type { PathCommit, PrHistory, PrHistoryItem, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ChildableLogger } from '../../platform/prompt-log.js';
import { NotFoundError } from '../../platform/errors.js';
import {
  HISTORY_COMMITS_PER_FILE,
  MAX_HISTORY_FILES,
  MAX_HISTORY_PRS,
} from './constants.js';
import { notesFromBody, prNumbersFromMessage } from './helpers.js';

/**
 * Prior-PR history use case (ring ②). Commits per changed file come from GitHub
 * (`commits?path=` on the default branch, via the `GitHubClient` port) — the
 * clone is shallow, so it is never read. PR numbers are parsed from the first
 * line of each commit message; details come from one `getPullSummary` each.
 * Failures degrade (`github_unavailable` / `github_partial`), never throw.
 */
export class PrHistoryService {
  constructor(private container: Container) {}

  async getHistory(
    workspaceId: string,
    prId: string,
    logger?: ChildableLogger,
  ): Promise<PrHistory> {
    const started = Date.now();
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    const stats = { files: 0, commitCalls: 0, candidates: 0, items: 0 };
    const finish = (result: PrHistory): PrHistory => {
      logger?.info(
        {
          prId,
          ...stats,
          items: result.history.length,
          degraded: result.degraded ?? false,
          reason: result.reason,
          ms: Date.now() - started,
        },
        'pr-history: computed',
      );
      return result;
    };
    const unavailable = (): PrHistory =>
      finish({ history: [], degraded: true, reason: 'github_unavailable' });

    const prFiles = await this.container.reviewRepo.getPrFiles(pull.id);
    const paths = [...prFiles]
      .sort(
        (a, b) =>
          b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path),
      )
      .slice(0, MAX_HISTORY_FILES)
      .map((f) => f.path);
    stats.files = paths.length;
    if (paths.length === 0) return finish({ history: [] });

    let github;
    try {
      github = await this.container.github();
    } catch {
      return unavailable();
    }

    stats.commitCalls = paths.length;
    const commitResults = await Promise.allSettled(
      paths.map((p) =>
        github.listCommitsForPath(ref, p, {
          ref: repo.defaultBranch,
          perPage: HISTORY_COMMITS_PER_FILE,
        }),
      ),
    );
    const failedCommits = commitResults.filter((r) => r.status === 'rejected').length;
    if (failedCommits === commitResults.length) return unavailable();
    let partial = failedCommits > 0;

    // PR number → files it touched + its newest commit date.
    const candidates = new Map<number, { files: Set<string>; date: number }>();
    commitResults.forEach((res, i) => {
      if (res.status !== 'fulfilled') return;
      const path = paths[i]!;
      for (const c of res.value as PathCommit[]) {
        for (const n of prNumbersFromMessage(c.message)) {
          if (n === pull.number) continue;
          const entry = candidates.get(n) ?? { files: new Set<string>(), date: 0 };
          entry.files.add(path);
          const t = c.date ? Date.parse(c.date) : 0;
          if (Number.isFinite(t) && t > entry.date) entry.date = t;
          candidates.set(n, entry);
        }
      }
    });
    stats.candidates = candidates.size;

    const top = [...candidates.entries()]
      .sort((a, b) => b[1].date - a[1].date || b[0] - a[0])
      .slice(0, MAX_HISTORY_PRS);
    const summaries = await Promise.allSettled(
      top.map(([n]) => github.getPullSummary(ref, n)),
    );

    const history: PrHistoryItem[] = [];
    summaries.forEach((res, i) => {
      if (res.status === 'rejected') {
        partial = true;
        return;
      }
      const s = res.value;
      if (!s.merged_at) return;
      history.push({
        pr_number: top[i]![0],
        title: s.title,
        merged_at: s.merged_at,
        author: s.author,
        files_overlap: [...top[i]![1].files].sort(),
        notes: notesFromBody(s.body),
      });
    });
    history.sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));

    return finish(
      partial ? { history, degraded: true, reason: 'github_partial' } : { history },
    );
  }
}
