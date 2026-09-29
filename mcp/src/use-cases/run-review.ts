/**
 * Use case (ring ②) — devdigest_run_review. Takes `signal`/`onProgress`,
 * never the SDK's `extra` or a `progressToken` (onion-architecture §4, by
 * analogy). Must not import the SDK, `fetch`, the environment, `api/`,
 * `tools/`, `server.ts`, `index.ts`, `config.ts` or `log.ts`.
 */
import { CONFIRM_TIMEOUT_MS, RUN_DEADLINE_MS, UNTRUSTED_NOTICE } from '../constants.js';
import {
  resolutionBudgetExceeded,
  reviewNotReady,
  runFailed,
  runNotOnPr,
  StaleIdError,
  unexpectedResponse,
} from '../errors.js';
import { loc, sortFindings } from '../format.js';
import type { DevDigestApi } from '../ports.js';
import type { AgentRef, PrRef, Resolver } from '../resolve.js';
import type { RunReviewFindingOutput, RunReviewOutput } from '../contracts.js';

export interface RunReviewInput {
  pr: string;
  agent: string;
  limit: number;
}

export interface RunReviewCtx {
  /** MCP-level cancellation — a real abort, distinct from the run deadline. */
  signal: AbortSignal;
  onProgress?: ((msg: string) => void) | undefined;
  deadlineMs?: number;
  confirmTimeoutMs?: number;
}

export interface RunReviewDeps {
  api: DevDigestApi;
  resolver: Resolver;
}

/** Resolves `pr`/`agent`, starts the review, waits for it, and confirms the
 * outcome — returning the `done`/`running` object, `null` on caller abort, or
 * throwing a `DevDigestError`. */
export async function runReview(
  deps: RunReviewDeps,
  input: RunReviewInput,
  ctx: RunReviewCtx,
): Promise<RunReviewOutput | null> {
  const deadlineMs = ctx.deadlineMs ?? RUN_DEADLINE_MS;
  const confirmTimeoutMs = ctx.confirmTimeoutMs ?? CONFIRM_TIMEOUT_MS;
  const t0 = Date.now();

  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), deadlineMs);
  const combined = AbortSignal.any([ctx.signal, deadlineController.signal]);

  /** Resolves `pr`/`agent` under the combined signal, then re-checks the
   * budget (elapsed > deadlineMs - confirmTimeoutMs, or the deadline already
   * fired): returns `null` on a caller abort (before or after resolving),
   * throws E19 if the budget is gone, otherwise returns the resolved refs.
   * Called before the first `startReview` POST, and again — after
   * `invalidate()` — before the `StaleIdError` retry POST, so a retry never
   * starts with less than `confirmTimeoutMs` left before the deadline. */
  async function resolveUnderBudget(): Promise<{ pr: PrRef; agentRef: AgentRef } | null> {
    let pr: PrRef;
    let agentRef: AgentRef;
    try {
      pr = await deps.resolver.pr(input.pr, combined);
      agentRef = await deps.resolver.agent(input.agent, combined);
    } catch (err) {
      if (ctx.signal.aborted) return null;
      if (deadlineController.signal.aborted) {
        throw resolutionBudgetExceeded(input.pr, Math.round(deadlineMs / 1000));
      }
      throw err;
    }

    if (ctx.signal.aborted) return null;
    const elapsed = Date.now() - t0;
    if (deadlineController.signal.aborted || elapsed > deadlineMs - confirmTimeoutMs) {
      throw resolutionBudgetExceeded(input.pr, Math.round(deadlineMs / 1000));
    }
    return { pr, agentRef };
  }

  try {
    const resolved = await resolveUnderBudget();
    if (resolved === null) return null;
    let pr = resolved.pr;
    let agentRef = resolved.agentRef;

    const startWithCurrentIds = (): ReturnType<DevDigestApi['startReview']> =>
      deps.api.startReview(pr.id, agentRef.id, { signal: ctx.signal, timeoutMs: confirmTimeoutMs });

    let target;
    try {
      target = await startWithCurrentIds();
    } catch (err) {
      if (!(err instanceof StaleIdError)) throw err;
      // The cached pr/agent id no longer exists (e.g. the repo was deleted
      // and re-added in the web app). No run was started — safe to
      // invalidate, re-resolve under the same budget check, and retry once;
      // a second failure surfaces the proper E-text (never retried again
      // after this).
      deps.resolver.invalidate();
      const reResolved = await resolveUnderBudget();
      if (reResolved === null) return null;
      pr = reResolved.pr;
      agentRef = reResolved.agentRef;
      target = await startWithCurrentIds();
    }

    try {
      await deps.api.streamRunEvents(
        target.run_id,
        (e) => {
          if (ctx.onProgress) ctx.onProgress(`${target.agent_name}: ${e.msg.slice(0, 120)}`);
        },
        { signal: combined },
      );
    } catch {
      // A stream error only ends the wait — the confirming GETs below decide
      // the outcome, same as a deadline.
    }

    if (ctx.signal.aborted) return null;

    let runs;
    try {
      runs = await deps.api.listRuns(pr.id, { signal: ctx.signal, timeoutMs: confirmTimeoutMs });
    } catch (err) {
      if (ctx.signal.aborted) return null;
      throw err;
    }
    const run = runs.find((r) => r.run_id === target.run_id);
    if (!run) throw runNotOnPr(target.run_id, pr.label);

    if (run.status === 'running') {
      return {
        untrusted_notice: UNTRUSTED_NOTICE,
        status: 'running',
        pr: pr.label,
        pr_title: pr.title ?? '',
        run_id: target.run_id,
        agent_id: agentRef.id,
        agent_name: target.agent_name,
        elapsed_s: Math.round((Date.now() - t0) / 1000),
        hint: `Still running on the DevDigest server. Call devdigest_get_findings with pr=${pr.label} and run_id=${target.run_id} in a minute; do not start another run.`,
      };
    }

    if (run.status === 'failed' || run.status === 'cancelled') {
      throw runFailed(target.run_id, target.agent_name, pr.label, run.status, run.error);
    }

    if (run.status !== 'done') {
      throw unexpectedResponse(
        'GET',
        `/pulls/${pr.id}/runs`,
        'status',
        `has unexpected value "${String(run.status)}"`,
      );
    }

    let reviews;
    try {
      reviews = await deps.api.listReviews(pr.id, { signal: ctx.signal, timeoutMs: confirmTimeoutMs });
    } catch (err) {
      if (ctx.signal.aborted) return null;
      throw err;
    }
    const review = reviews.find((r) => r.kind === 'review' && r.run_id === target.run_id);
    if (!review) throw reviewNotReady(target.run_id, pr.id);

    const nonDismissed = review.findings.filter((f) => !f.dismissed_at);
    const sorted = sortFindings(nonDismissed);
    const findings: RunReviewFindingOutput[] = sorted.slice(0, input.limit).map((f) => ({
      severity: f.severity,
      title: f.title,
      loc: loc(f.file, f.start_line, f.end_line),
      category: f.category,
    }));
    const omitted = nonDismissed.length - findings.length;

    const out: RunReviewOutput = {
      untrusted_notice: UNTRUSTED_NOTICE,
      status: 'done',
      pr: pr.label,
      pr_title: pr.title ?? '',
      run_id: target.run_id,
      agent_id: agentRef.id,
      agent_name: target.agent_name,
      verdict: review.verdict,
      score: review.score,
      summary: review.summary,
      findings_count: nonDismissed.length,
      cost_usd: run.cost_usd,
      duration_ms: run.duration_ms,
      findings,
      omitted,
    };
    if (omitted > 0) {
      out.hint = 'Call devdigest_get_findings with pr and run_id for all findings.';
    }
    return out;
  } finally {
    clearTimeout(deadlineTimer);
  }
}
