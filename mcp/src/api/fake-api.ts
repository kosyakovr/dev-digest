/**
 * Adapter (ring ③) — the `DevDigestApi` port double (onion-architecture §5,
 * §9 by analogy: a fake, not a spy). Production code — it must implement the
 * same interface as `HttpDevDigestApi` — but imported only by tests; kept
 * out of the runtime graph by `mcp-fake-in-production` (`fitness-greps.sh`).
 */
import type {
  AgentWire,
  ConventionWire,
  PullDetailWire,
  PullListItemWire,
  RepoWire,
  ReviewRunTargetWire,
  ReviewWire,
  RunEventWire,
  RunSummaryWire,
} from '../contracts.js';
import { NotFoundError } from '../errors.js';
import type { CallOpts, DevDigestApi, StreamEnd } from '../ports.js';

export interface ScriptedOutcome {
  delayMs?: number;
  error?: Error;
  value?: unknown;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
  opts?: CallOpts;
}

export type StreamScript =
  | { kind: 'events'; events: { atMs: number; event: RunEventWire }[]; closeAtMs?: number }
  | { kind: 'never' };

function makeAbortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

/** In-memory, scriptable stand-in for the DevDigest HTTP API. Set the plain
 * state fields (`repos`, `pulls`, …) for the happy path; use `script()` for
 * per-call delays/errors/overrides, and `scriptStream()` for the SSE stream
 * `devdigest_run_review` waits on. */
export class FakeDevDigestApi implements DevDigestApi {
  repos: RepoWire[] = [];
  pulls: Record<string, PullListItemWire[]> = {};
  prs: Record<string, PullDetailWire> = {};
  agents: AgentWire[] = [];
  runs: Record<string, RunSummaryWire[]> = {};
  reviews: Record<string, ReviewWire[]> = {};
  conventions: Record<string, ConventionWire[]> = {};

  calls: RecordedCall[] = [];

  private readonly scripts = new Map<string, ScriptedOutcome[]>();
  private streamScript: StreamScript = { kind: 'never' };

  /** Queues one scripted outcome for the next call to `method` (FIFO). */
  script(method: string, outcome: ScriptedOutcome): void {
    const list = this.scripts.get(method) ?? [];
    list.push(outcome);
    this.scripts.set(method, list);
  }

  scriptStream(script: StreamScript): void {
    this.streamScript = script;
  }

  private wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(makeAbortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort);
    });
  }

  private async apply<T>(
    method: string,
    args: unknown[],
    opts: CallOpts | undefined,
    fallback: () => T,
  ): Promise<T> {
    this.calls.push({ method, args, opts });
    const outcome = this.scripts.get(method)?.shift();
    if (outcome?.delayMs !== undefined) {
      await this.wait(outcome.delayMs, opts?.signal);
    }
    if (opts?.signal?.aborted) throw makeAbortError();
    if (outcome?.error) throw outcome.error;
    if (outcome && 'value' in outcome) return outcome.value as T;
    return fallback();
  }

  listAgents(opts?: CallOpts): Promise<AgentWire[]> {
    return this.apply('listAgents', [], opts, () => this.agents);
  }

  listRepos(opts?: CallOpts): Promise<RepoWire[]> {
    return this.apply('listRepos', [], opts, () => this.repos);
  }

  listPulls(repoId: string, opts?: CallOpts): Promise<PullListItemWire[]> {
    return this.apply('listPulls', [repoId], opts, () => this.pulls[repoId] ?? []);
  }

  getPull(prId: string, opts?: CallOpts): Promise<PullDetailWire> {
    return this.apply('getPull', [prId], opts, () => {
      const pr = this.prs[prId];
      if (!pr) throw new NotFoundError(`/pulls/${prId}`, 'PR not found');
      return pr;
    });
  }

  /** Matches the port's `startReview` (single target, not the envelope) —
   * script a `{run_id, agent_id, agent_name}` value for a specific case; the
   * fallback below is a de-facto default only (Handoff to test-writer). */
  startReview(prId: string, agentId: string, opts?: CallOpts): Promise<ReviewRunTargetWire> {
    return this.apply('startReview', [prId, agentId], opts, () => ({
      run_id: `${prId}-run`,
      agent_id: agentId,
      agent_name: agentId,
    }));
  }

  streamRunEvents(runId: string, onEvent: (e: RunEventWire) => void, opts?: CallOpts): Promise<StreamEnd> {
    this.calls.push({ method: 'streamRunEvents', args: [runId], opts });
    const script = this.streamScript;
    const signal = opts?.signal;
    return new Promise<StreamEnd>((resolve) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let settled = false;
      const finish = (end: StreamEnd): void => {
        if (settled) return;
        settled = true;
        for (const t of timers) clearTimeout(t);
        signal?.removeEventListener('abort', onAbort);
        resolve(end);
      };
      const onAbort = (): void => finish('aborted');

      if (signal) {
        if (signal.aborted) {
          finish('aborted');
          return;
        }
        signal.addEventListener('abort', onAbort);
      }

      if (script.kind === 'events') {
        for (const { atMs, event } of script.events) {
          timers.push(
            setTimeout(() => {
              if (!settled) onEvent(event);
            }, atMs),
          );
        }
        if (script.closeAtMs !== undefined) {
          timers.push(setTimeout(() => finish('closed'), script.closeAtMs));
        }
      }
      // 'never' (or 'events' with no closeAtMs): only resolves on abort.
    });
  }

  listRuns(prId: string, opts?: CallOpts): Promise<RunSummaryWire[]> {
    return this.apply('listRuns', [prId], opts, () => this.runs[prId] ?? []);
  }

  listReviews(prId: string, opts?: CallOpts): Promise<ReviewWire[]> {
    return this.apply('listReviews', [prId], opts, () => this.reviews[prId] ?? []);
  }

  listConventions(repoId: string, opts?: CallOpts): Promise<ConventionWire[]> {
    return this.apply('listConventions', [repoId], opts, () => this.conventions[repoId] ?? []);
  }
}
