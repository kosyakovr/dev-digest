/**
 * Ring ②: `get_findings` use case. Selects the stored reviews of a PR — the one
 * of `run_id`, else the newest `kind='review'` of every agent (or of the one
 * asked for) — then filters, sorts and pages their findings as one list.
 * Read-only. No HTTP and no status codes here.
 */
import type { Clock } from '../core/clock.ts';
import { DevDigestError } from '../core/errors.ts';
import type { DevDigestApi } from '../core/port.ts';
import type { Review } from '../core/schemas.ts';
import type { FindingsView, Severity } from '../core/views.ts';
import { callsUntil, TIMEOUT_READ_MS } from './budget.ts';
import { parsePrRef } from './refs.ts';
import { resolvePull } from './resolve.ts';
import { buildFindingsView, buildReviewView, normalizeStatus } from './review-view.ts';

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

/** Each review is built unpaged; `buildFindingsView` pages them together. */
const UNPAGED = { limit: Number.POSITIVE_INFINITY, offset: 0 };

/** The newest `kind='review'` review per agent, newest first (the API lists newest first). */
function latestPerAgent(reviews: Review[]): Review[] {
  const latest = new Map<string, Review>();
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    const key = r.agent_id ?? r.agent_name?.toLowerCase() ?? r.id;
    if (!latest.has(key)) latest.set(key, r);
  }
  return [...latest.values()];
}

export async function getFindings(
  deps: FindingsDeps,
  input: FindingsInput,
  signal?: AbortSignal,
): Promise<FindingsView> {
  const calls = callsUntil(Number.POSITIVE_INFINITY, deps.clock, signal);
  const pr = await resolvePull(deps.api, parsePrRef(input.pr), calls);
  const [runs, reviews] = await Promise.all([
    deps.api.listRuns(pr.prId, calls(TIMEOUT_READ_MS)),
    deps.api.listReviews(pr.prId, calls(TIMEOUT_READ_MS)),
  ]);
  const minSeverity = input.min_severity;

  if (input.run_id) {
    const run = runs.find((r) => r.run_id === input.run_id);
    const review = reviews.find((r) => r.run_id === input.run_id);
    if (!run && !review) {
      throw new DevDigestError('run_not_found', {
        subject: input.run_id,
        candidates: [pr.label],
      });
    }
    const status = review ? 'done' : normalizeStatus(run?.status);
    const view = buildReviewView({
      prLabel: pr.label,
      runId: input.run_id,
      status,
      run,
      review,
      note:
        !review && run && normalizeStatus(run.status) === 'done'
          ? 'The run finished but stored no review.'
          : null,
      minSeverity,
      ...UNPAGED,
    });
    return buildFindingsView(pr.label, [view], input.offset, input.limit);
  }

  const wanted = input.agent?.trim().toLowerCase();
  const picked = latestPerAgent(reviews).filter(
    (r) =>
      !wanted || r.agent_name?.toLowerCase() === wanted || r.agent_id?.toLowerCase() === wanted,
  );
  if (picked.length === 0) {
    throw new DevDigestError('no_review', {
      ...(wanted ? { subject: input.agent?.trim() } : {}),
      candidates: [pr.label],
    });
  }
  const views = picked.map((review) =>
    buildReviewView({
      prLabel: pr.label,
      runId: review.run_id ?? null,
      status: 'done',
      run: review.run_id ? runs.find((r) => r.run_id === review.run_id) : undefined,
      review,
      minSeverity,
      ...UNPAGED,
    }),
  );
  return buildFindingsView(pr.label, views, input.offset, input.limit);
}
