/**
 * Ring ②: `get_findings` use case. Selects one stored review of a PR (by
 * `run_id`, else the newest `kind='review'`, optionally by agent), then filters,
 * sorts and pages its findings. Read-only. No HTTP and no status codes here.
 */
import type { Clock } from '../core/clock.ts';
import { DevDigestError } from '../core/errors.ts';
import type { DevDigestApi } from '../core/port.ts';
import type { ReviewView, Severity } from '../core/views.ts';
import { callsUntil, TIMEOUT_READ_MS } from './budget.ts';
import { parsePrRef } from './refs.ts';
import { resolvePull } from './resolve.ts';
import { buildReviewView, normalizeStatus } from './review-view.ts';

export interface FindingsDeps {
  api: DevDigestApi;
  clock: Clock;
}

export interface FindingsInput {
  pr: string;
  run_id?: string | undefined;
  agent?: string | undefined;
  min_severity: Severity;
  limit: number;
  offset: number;
}

export async function getFindings(
  deps: FindingsDeps,
  input: FindingsInput,
  signal?: AbortSignal,
): Promise<ReviewView> {
  const calls = callsUntil(Number.POSITIVE_INFINITY, deps.clock, signal);
  const pr = await resolvePull(deps.api, parsePrRef(input.pr), calls);
  const [runs, reviews] = await Promise.all([
    deps.api.listRuns(pr.prId, calls(TIMEOUT_READ_MS)),
    deps.api.listReviews(pr.prId, calls(TIMEOUT_READ_MS)),
  ]);
  const paging = { minSeverity: input.min_severity, limit: input.limit, offset: input.offset };

  if (input.run_id) {
    const run = runs.find((r) => r.run_id === input.run_id);
    const review = reviews.find((r) => r.run_id === input.run_id);
    if (!run && !review) {
      throw new DevDigestError('not_found', {
        resource: 'pr',
        serverMessage: 'No such run on this pull request.',
      });
    }
    const status = review ? 'done' : normalizeStatus(run?.status);
    return buildReviewView({
      prLabel: pr.label,
      runId: input.run_id,
      status,
      run,
      review,
      note:
        !review && run && normalizeStatus(run.status) === 'done'
          ? 'The run finished but stored no review.'
          : null,
      ...paging,
    });
  }

  const wanted = input.agent?.trim().toLowerCase();
  const review = reviews.find(
    (r) =>
      r.kind === 'review' &&
      (!wanted || r.agent_name?.toLowerCase() === wanted || r.agent_id?.toLowerCase() === wanted),
  );
  if (!review) {
    throw new DevDigestError('not_found', {
      resource: 'pr',
      serverMessage: wanted
        ? 'No finished review by that agent on this pull request yet. Run run_agent_on_pr first.'
        : 'No finished review on this pull request yet. Run run_agent_on_pr first.',
    });
  }
  const run = review.run_id ? runs.find((r) => r.run_id === review.run_id) : undefined;
  return buildReviewView({
    prLabel: pr.label,
    runId: review.run_id ?? null,
    status: 'done',
    run,
    review,
    ...paging,
  });
}
