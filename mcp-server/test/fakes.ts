/**
 * Test doubles for the mcp-server package: an in-memory `DevDigestApi`, a
 * virtual-time `Clock`, and small factories for the wire DTOs. No network.
 *
 * `FakeClock` never moves by itself. `await clock.run(promise)` drives a use case:
 * it lets every ready microtask run, and only when the promise is still pending
 * and a timer exists does it jump virtual time to the earliest timer.
 */
import type { Clock } from '../src/core/clock.ts';
import type { CallOpts, DevDigestApi } from '../src/core/port.ts';
import type {
  ActiveRun,
  Agent,
  Convention,
  Finding,
  Pull,
  Repo,
  Review,
  RunEvent,
  RunSummary,
  StartReviewResult,
} from '../src/core/schemas.ts';

export const REPO_ID = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_GENERAL_ID = '33333333-3333-4333-8333-333333333333';
export const AGENT_SECURITY_ID = '44444444-4444-4444-8444-444444444444';
export const RUN_ID = '55555555-5555-4555-8555-555555555555';
export const OTHER_RUN_ID = '66666666-6666-4666-8666-666666666666';

// ---- clock ------------------------------------------------------------------

interface Timer {
  at: number;
  fire(): void;
}

export class FakeClock implements Clock {
  t: number;
  private timers: Timer[] = [];

  constructor(start = 1_000_000) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timer: Timer = {
        at: this.t + Math.max(0, ms),
        fire: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
      };
      const onAbort = (): void => {
        this.timers = this.timers.filter((x) => x !== timer);
        timer.fire();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.timers.push(timer);
    });
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  /** Jump to the earliest timer and fire it. False when there is none. */
  advance(): boolean {
    if (this.timers.length === 0) return false;
    this.timers.sort((a, b) => a.at - b.at);
    const next = this.timers.shift();
    if (!next) return false;
    this.t = Math.max(this.t, next.at);
    next.fire();
    return true;
  }

  /** Drive `promise` to completion, moving virtual time only when everything else is idle. */
  async run<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    let idle = 0;
    while (!settled) {
      await new Promise<void>((r) => setImmediate(r));
      if (settled) break;
      if (this.advance()) idle = 0;
      else if (++idle > 100) throw new Error('FakeClock.run: promise is pending and no timer exists');
    }
    return promise;
  }
}

// ---- event streams ----------------------------------------------------------

export type EventsFactory = (runId: string, opts: CallOpts) => AsyncIterable<RunEvent>;

export function eventsOf(...events: RunEvent[]): EventsFactory {
  return () =>
    (async function* () {
      for (const e of events) yield e;
    })();
}

/** A stream that never yields and never ends (a run the in-memory bus has not seen). */
export function neverEndingEvents(): EventsFactory {
  return () => ({
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<RunEvent>>(() => undefined),
        return: () => Promise.resolve({ done: true as const, value: undefined }),
      };
    },
  });
}

/** A stream that ends, without events, once `ms` of virtual time have passed. */
export function endsAfter(clock: Clock, ms: number): EventsFactory {
  return () =>
    (async function* () {
      await clock.sleep(ms);
    })();
}

// ---- the fake port ----------------------------------------------------------

export type PortMethod =
  | 'listRepos'
  | 'listPulls'
  | 'listAgents'
  | 'activeRuns'
  | 'startReview'
  | 'runEvents'
  | 'listRuns'
  | 'listReviews'
  | 'listConventions';

export interface CallRecord {
  method: PortMethod;
  args: unknown[];
  timeoutMs: number;
  /** Virtual time at the call, when the fake was built with a clock. */
  at: number | null;
}

export class FakeDevDigestApi implements DevDigestApi {
  repos: Repo[] = [];
  pulls: Pull[] = [];
  agents: Agent[] = [];
  active: ActiveRun[] = [];
  reviews: Review[] = [];
  conventions: Convention[] = [];
  /** Successive `listRuns` answers; the last one repeats. */
  runsSequence: RunSummary[][] = [[]];
  startResult: StartReviewResult = {
    pr_id: PR_ID,
    runs: [{ run_id: RUN_ID, agent_id: AGENT_SECURITY_ID, agent_name: 'Security Reviewer' }],
  };
  events: EventsFactory = () =>
    (async function* (): AsyncGenerator<RunEvent> {
      // no events, ends at once
    })();
  /** A method listed here throws the given error instead of answering. */
  failures: Partial<Record<PortMethod, unknown>> = {};
  calls: CallRecord[] = [];

  private runsCalls = 0;
  private readonly clock: Clock | undefined;

  constructor(clock?: Clock) {
    this.clock = clock;
  }

  count(method: PortMethod): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  of(method: PortMethod): CallRecord[] {
    return this.calls.filter((c) => c.method === method);
  }

  private record(method: PortMethod, args: unknown[], opts: CallOpts): void {
    this.calls.push({ method, args, timeoutMs: opts.timeoutMs, at: this.clock ? this.clock.now() : null });
    if (method in this.failures) throw this.failures[method];
  }

  listRepos(opts: CallOpts): Promise<Repo[]> {
    return this.answer('listRepos', [], opts, () => this.repos);
  }

  listPulls(repoId: string, opts: CallOpts): Promise<Pull[]> {
    return this.answer('listPulls', [repoId], opts, () => this.pulls);
  }

  listAgents(opts: CallOpts): Promise<Agent[]> {
    return this.answer('listAgents', [], opts, () => this.agents);
  }

  activeRuns(prId: string, opts: CallOpts): Promise<ActiveRun[]> {
    return this.answer('activeRuns', [prId], opts, () => this.active);
  }

  startReview(prId: string, agentId: string, opts: CallOpts): Promise<StartReviewResult> {
    return this.answer('startReview', [prId, agentId], opts, () => this.startResult);
  }

  runEvents(runId: string, opts: CallOpts): AsyncIterable<RunEvent> {
    this.record('runEvents', [runId], opts);
    return this.events(runId, opts);
  }

  listRuns(prId: string, opts: CallOpts): Promise<RunSummary[]> {
    return this.answer('listRuns', [prId], opts, () => {
      const i = Math.min(this.runsCalls, this.runsSequence.length - 1);
      this.runsCalls += 1;
      return this.runsSequence[i] ?? [];
    });
  }

  listReviews(prId: string, opts: CallOpts): Promise<Review[]> {
    return this.answer('listReviews', [prId], opts, () => this.reviews);
  }

  listConventions(repoId: string, opts: CallOpts): Promise<Convention[]> {
    return this.answer('listConventions', [repoId], opts, () => this.conventions);
  }

  private async answer<T>(method: PortMethod, args: unknown[], opts: CallOpts, value: () => T): Promise<T> {
    this.record(method, args, opts);
    return value();
  }
}

// ---- DTO factories ----------------------------------------------------------

export function repo(over: Partial<Repo> = {}): Repo {
  return { id: REPO_ID, full_name: 'acme/payments-api', ...over };
}

export function pull(over: Partial<Pull> = {}): Pull {
  return { id: PR_ID, number: 482, title: 'Add refund endpoint', ...over };
}

export function agent(over: Partial<Agent> = {}): Agent {
  return {
    id: AGENT_SECURITY_ID,
    name: 'Security Reviewer',
    description: 'Looks for vulnerabilities',
    provider: 'anthropic',
    model: 'claude-sonnet',
    enabled: true,
    version: 3,
    ...over,
  };
}

export function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'because',
    suggestion: null,
    confidence: 0.8,
    dismissed_at: null,
    ...over,
  };
}

export function review(over: Partial<Review> = {}): Review {
  return {
    id: 'rv-1',
    run_id: RUN_ID,
    agent_id: AGENT_SECURITY_ID,
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Needs work',
    score: 55,
    created_at: '2026-10-01T10:00:00Z',
    findings: [],
    ...over,
  };
}

export function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: RUN_ID,
    agent_id: AGENT_SECURITY_ID,
    agent_name: 'Security Reviewer',
    status: 'done',
    error: null,
    duration_ms: 12_300,
    cost_usd: 0.0123,
    findings_count: 0,
    score: 55,
    ...over,
  };
}

export function convention(over: Partial<Convention> = {}): Convention {
  return {
    id: 'c-1',
    rule: 'Use named exports',
    rationale: 'Greppable',
    category: 'style',
    evidence_path: 'src/index.ts',
    evidence_line: 7,
    evidence_snippet: 'export const x = 1;',
    confidence: 0.9,
    status: 'accepted',
    ...over,
  };
}

export function runEvent(seq: number, kind: string, msg: string, runId = RUN_ID): RunEvent {
  return { runId, seq, kind, msg };
}

/** A fake with the repo, PR and two agents of the plan's examples already loaded. */
export function seededApi(clock?: Clock): FakeDevDigestApi {
  const api = new FakeDevDigestApi(clock);
  api.repos = [repo()];
  api.pulls = [pull()];
  api.agents = [
    agent({ id: AGENT_GENERAL_ID, name: 'General Reviewer' }),
    agent({ id: AGENT_SECURITY_ID, name: 'Security Reviewer' }),
  ];
  return api;
}
