/**
 * Ring ②: `run_agent_on_pr` use case. resolve PR and agent, attach to a run that
 * is already in progress or start one (the ONLY write: one review POST), wait
 * for it through the live event stream with a polling fallback, then confirm the
 * final state. It never cancels a run. All time comes from the injected `Clock`;
 * the budget is explained in `./budget.ts`. No HTTP and no status codes here.
 */
import type { Clock } from '../core/clock.ts';
import { DevDigestError } from '../core/errors.ts';
import type { DevDigestApi } from '../core/port.ts';
import type { RunEvent, RunSummary } from '../core/schemas.ts';
import { collapseToOneLine, truncate } from '../core/text.ts';
import type { ReviewView } from '../core/views.ts';
import {
  callsUntil,
  POLL_INTERVAL_MS,
  TIMEOUT_ACTIVE_MS,
  TIMEOUT_CONFIRM_MS,
  TIMEOUT_POLL_MS,
  TIMEOUT_START_MS,
  TOTAL_BUDGET_MS,
  WAIT_WINDOW_MS,
  TIMEOUT_AGENTS_MS,
} from './budget.ts';
import { parsePrRef } from './refs.ts';
import { pickAgent, resolvePull } from './resolve.ts';
import { buildReviewView, normalizeStatus } from './review-view.ts';

export interface RunReviewDeps {
  api: DevDigestApi;
  clock: Clock;
}

export interface RunReviewInput {
  pr: string;
  agent: string;
}

export interface RunReviewHooks {
  /** Called once per run event with a 1-based counter and a one-line message (≤160 chars). */
  onProgress?: (progress: number, message: string) => void;
  /** The MCP request's signal: aborts HTTP calls and the wait; the run itself is never cancelled. */
  signal?: AbortSignal | undefined;
}

export type RunOutcome = ReviewView;

/** Findings shown inline; the rest are reachable through `get_findings`. */
export const RUN_FINDINGS_LIMIT = 50;

const NOTE_UNCONFIRMED = 'The final state could not be confirmed in time; the run was not cancelled.';
const NOTE_STILL_RUNNING = 'The run is still in progress; it was not cancelled.';

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error('aborted');
}

export async function runAgentOnPr(
  deps: RunReviewDeps,
  input: RunReviewInput,
  hooks: RunReviewHooks = {},
): Promise<RunOutcome> {
  const { api, clock } = deps;
  const { signal } = hooks;
  const t0 = clock.now();
  const waitDeadline = t0 + WAIT_WINDOW_MS;
  const hardDeadline = t0 + TOTAL_BUDGET_MS;
  const calls = callsUntil(waitDeadline, clock, signal);

  const prRef = parsePrRef(input.pr);
  const [pr, agents] = await Promise.all([
    resolvePull(api, prRef, calls),
    api.listAgents(calls(TIMEOUT_AGENTS_MS)),
  ]);
  const agent = pickAgent(agents, input.agent);

  const active = await api.activeRuns(pr.prId, calls(TIMEOUT_ACTIVE_MS));
  const existing = active.find((r) => r.agent_id === agent.id);
  let runId: string;
  const attached = existing !== undefined;
  if (existing) {
    runId = existing.run_id;
  } else {
    const started = await api.startReview(pr.prId, agent.id, calls(TIMEOUT_START_MS));
    const target = started.runs[0];
    if (!target) {
      // Unreachable in practice: the port schema requires at least one run.
      throw new DevDigestError('bad_response', { operation: 'start the review' });
    }
    runId = target.run_id;
  }

  const streamEnded = await waitOnStream(api, clock, runId, waitDeadline, hooks);
  throwIfAborted(signal);
  if (streamEnded) await pollUntilSettled(api, clock, pr.prId, runId, waitDeadline, calls, signal);
  throwIfAborted(signal);

  const confirmCalls = callsUntil(hardDeadline, clock, signal);
  const paging = { minSeverity: 'SUGGESTION' as const, limit: RUN_FINDINGS_LIMIT, offset: 0 };
  const base = { prLabel: pr.label, runId, attached, agentName: agent.name };
  try {
    const [runs, reviews] = await Promise.all([
      api.listRuns(pr.prId, confirmCalls(TIMEOUT_CONFIRM_MS)),
      api.listReviews(pr.prId, confirmCalls(TIMEOUT_CONFIRM_MS)),
    ]);
    const run = runs.find((r) => r.run_id === runId);
    const status = normalizeStatus(run?.status);
    if (status === 'running') {
      return buildReviewView({ ...base, status, run, ...paging, note: NOTE_STILL_RUNNING });
    }
    const review = status === 'done' ? reviews.find((r) => r.run_id === runId) : undefined;
    return buildReviewView({
      ...base,
      status,
      run,
      review,
      ...paging,
      note: status === 'done' && !review ? 'The run finished but stored no review.' : null,
    });
  } catch (err) {
    throwIfAborted(signal);
    if (!(err instanceof DevDigestError)) throw err;
    return buildReviewView({ ...base, status: 'running', ...paging, note: NOTE_UNCONFIRMED });
  }
}

/**
 * Reads run events until the stream ends or `deadline`. Returns true when the stream
 * ended before the deadline (so the caller should check the stored state).
 */
async function waitOnStream(
  api: DevDigestApi,
  clock: Clock,
  runId: string,
  deadline: number,
  hooks: RunReviewHooks,
): Promise<boolean> {
  const ctl = new AbortController();
  const stop = (): void => ctl.abort();
  hooks.signal?.addEventListener('abort', stop, { once: true });
  const timer = clock.sleep(Math.max(0, deadline - clock.now()), ctl.signal).then(stop);
  const aborted = new Promise<'aborted'>((resolve) => {
    if (ctl.signal.aborted) resolve('aborted');
    else ctl.signal.addEventListener('abort', () => resolve('aborted'), { once: true });
  });

  let progress = 0;
  let ended = false;
  const iterator = api
    .runEvents(runId, { signal: ctl.signal, timeoutMs: TIMEOUT_ACTIVE_MS })
    [Symbol.asyncIterator]();
  try {
    for (;;) {
      const step = await Promise.race([iterator.next(), aborted]);
      if (step === 'aborted') break;
      if (step.done) {
        ended = true;
        break;
      }
      progress += 1;
      hooks.onProgress?.(progress, progressMessage(step.value));
    }
  } catch {
    // A failed stream is not fatal: the caller falls back to polling.
    ended = !ctl.signal.aborted;
  } finally {
    ctl.abort();
    void Promise.resolve(iterator.return?.()).catch(() => undefined);
    hooks.signal?.removeEventListener('abort', stop);
    void timer;
  }
  return ended && clock.now() < deadline;
}

function progressMessage(ev: RunEvent): string {
  return truncate(collapseToOneLine(`${ev.kind}: ${ev.msg}`), 160);
}

/** Polls the run history every `POLL_INTERVAL_MS` until the run leaves `running` or `deadline`. */
async function pollUntilSettled(
  api: DevDigestApi,
  clock: Clock,
  prId: string,
  runId: string,
  deadline: number,
  calls: ReturnType<typeof callsUntil>,
  signal: AbortSignal | undefined,
): Promise<void> {
  while (clock.now() < deadline) {
    throwIfAborted(signal);
    let row: RunSummary | undefined;
    try {
      row = (await api.listRuns(prId, calls(TIMEOUT_POLL_MS))).find((r) => r.run_id === runId);
    } catch (err) {
      throwIfAborted(signal);
      if (!(err instanceof DevDigestError)) throw err;
    }
    if (row && normalizeStatus(row.status) !== 'running') return;
    await clock.sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - clock.now())), signal);
  }
}
