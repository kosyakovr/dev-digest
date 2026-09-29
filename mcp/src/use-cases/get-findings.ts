/**
 * Use case (ring ②) — devdigest_get_findings. Must not import the SDK,
 * `fetch`, the environment, `api/`, `tools/`, `server.ts`, `index.ts`,
 * `config.ts` or `log.ts`.
 */
import type { FindingWire, GetFindingsOutput, ReviewWire } from '../contracts.js';
import { UNTRUSTED_NOTICE, UUID_RE } from '../constants.js';
import {
  reviewNotReady,
  runAgentMismatch,
  runFailed,
  runNotOnPr,
  StaleIdError,
  unexpectedResponse,
} from '../errors.js';
import {
  decodeCursor,
  encodeCursor,
  minSeverityFilter,
  projectFinding,
  projectReview,
  severityRank,
  type ResponseFormat,
} from '../format.js';
import type { DevDigestApi } from '../ports.js';
import type { AgentRef, PrRef, Resolver } from '../resolve.js';

export interface GetFindingsInput {
  pr: string;
  run_id?: string;
  agent?: string;
  severity?: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  limit: number;
  cursor?: string;
  response_format: ResponseFormat;
}

export interface GetFindingsDeps {
  api: DevDigestApi;
  resolver: Resolver;
}

function unknownAgent(name: string | null | undefined): string {
  return name ?? '(unknown agent)';
}

/** Resolves `pr` (+ `agent`, if given), then calls `listReviews(pr.id)`; on a
 * `StaleIdError` (the cached `pr.id` no longer exists — e.g. the repo was
 * deleted and re-added), invalidates every resolver cache, re-resolves once,
 * and retries the read once. Safe: both calls are read-only. A second
 * failure propagates as the proper E-text. */
async function resolveAndListReviews(
  deps: GetFindingsDeps,
  input: GetFindingsInput,
  signal: AbortSignal,
): Promise<{ pr: PrRef; agentRef: AgentRef | null; allReviews: ReviewWire[] }> {
  const attempt = async (): Promise<{ pr: PrRef; agentRef: AgentRef | null; allReviews: ReviewWire[] }> => {
    const pr = await deps.resolver.pr(input.pr, signal);
    const agentRef = input.agent ? await deps.resolver.agent(input.agent, signal) : null;
    const allReviews = await deps.api.listReviews(pr.id, { signal });
    return { pr, agentRef, allReviews };
  };
  try {
    return await attempt();
  } catch (err) {
    if (!(err instanceof StaleIdError)) throw err;
    deps.resolver.invalidate();
    return attempt();
  }
}

export async function getFindings(
  deps: GetFindingsDeps,
  input: GetFindingsInput,
  signal: AbortSignal,
): Promise<GetFindingsOutput> {
  const { pr, agentRef, allReviews } = await resolveAndListReviews(deps, input, signal);
  const reviewsOnly = allReviews.filter((r) => r.kind === 'review');

  let selected: ReviewWire[];

  if (input.run_id) {
    const runId = UUID_RE.test(input.run_id) ? input.run_id.toLowerCase() : input.run_id;
    const match = reviewsOnly.find((r) => r.run_id === runId);
    if (match) {
      if (agentRef && match.agent_id !== agentRef.id) {
        throw runAgentMismatch(runId, unknownAgent(match.agent_name), input.agent as string);
      }
      selected = [match];
    } else {
      let runs;
      try {
        runs = await deps.api.listRuns(pr.id, { signal });
      } catch (err) {
        if (!(err instanceof StaleIdError)) throw err;
        deps.resolver.invalidate();
        const fresh = await deps.resolver.pr(input.pr, signal);
        runs = await deps.api.listRuns(fresh.id, { signal });
      }
      const run = runs.find((r) => r.run_id === runId);
      if (!run) throw runNotOnPr(runId, pr.label);
      if (agentRef && run.agent_id !== agentRef.id) {
        throw runAgentMismatch(runId, unknownAgent(run.agent_name), input.agent as string);
      }
      if (run.status === 'running') {
        return {
          untrusted_notice: UNTRUSTED_NOTICE,
          pr: pr.label,
          pr_title: pr.title ?? '',
          status: 'running',
          run_id: runId,
          agent_name: run.agent_name,
          reviews: [],
          findings: [],
          total: 0,
          next_cursor: null,
          hint: 'Run still in progress; call again in a minute.',
        };
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        throw runFailed(runId, unknownAgent(run.agent_name), pr.label, run.status, run.error);
      }
      if (run.status === 'done') {
        throw reviewNotReady(runId, pr.id);
      }
      throw unexpectedResponse(
        'GET',
        `/pulls/${pr.id}/runs`,
        'status',
        `has unexpected value "${String(run.status)}"`,
      );
    }
  } else {
    // Newest review per agent, in the order the server returned them
    // (newest-first): the first occurrence of each agent_id wins.
    const byAgent = agentRef ? reviewsOnly.filter((r) => r.agent_id === agentRef.id) : reviewsOnly;
    const seen = new Set<string>();
    selected = [];
    for (const r of byAgent) {
      const key = r.agent_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(r);
    }
  }

  const severityOk = minSeverityFilter(input.severity);
  const pool: { finding: FindingWire; review: ReviewWire }[] = [];
  for (const review of selected) {
    for (const finding of review.findings) {
      if (finding.dismissed_at) continue;
      if (!severityOk(finding.severity)) continue;
      pool.push({ finding, review });
    }
  }
  pool.sort((a, b) => {
    const bySeverity = severityRank(a.finding.severity) - severityRank(b.finding.severity);
    if (bySeverity !== 0) return bySeverity;
    if (a.finding.file !== b.finding.file) return a.finding.file < b.finding.file ? -1 : 1;
    return a.finding.start_line - b.finding.start_line;
  });

  const total = pool.length;
  const offset = input.cursor ? decodeCursor(input.cursor) : 0;
  const page = pool.slice(offset, offset + input.limit);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : null;

  const findings = page.map(({ finding, review }) =>
    projectFinding(finding, input.response_format, {
      agentName: review.agent_name ?? null,
      runId: review.run_id,
    }),
  );

  const reviews = selected.map((r) => {
    const findingsCount = r.findings.filter((f) => !f.dismissed_at).length;
    return projectReview(r, input.response_format, findingsCount);
  });

  const out: GetFindingsOutput = {
    untrusted_notice: UNTRUSTED_NOTICE,
    pr: pr.label,
    pr_title: pr.title ?? '',
    reviews,
    findings,
    total,
    next_cursor: nextCursor,
  };
  if (input.response_format === 'detailed') out.pr_id = pr.id;
  if (reviews.length === 0) {
    out.hint = `No finished reviews for ${pr.label}. Run one with devdigest_run_review.`;
  }
  return out;
}
