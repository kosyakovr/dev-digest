import { describe, expect, it } from 'vitest';
import { DevDigestError } from '../src/core/errors.ts';
import { renderError, renderRunOutcome } from '../src/format/text.ts';
import { runAgentOnPr } from '../src/usecases/run-review.ts';
import {
  AGENT_GENERAL_ID,
  AGENT_SECURITY_ID,
  endsAfter,
  eventsOf,
  FakeClock,
  finding,
  neverEndingEvents,
  OTHER_RUN_ID,
  PR_ID,
  review,
  run,
  runEvent,
  RUN_ID,
  seededApi,
} from './fakes.ts';

const INPUT = { pr: 'acme/payments-api#482', agent: 'Security Reviewer' };

function setup() {
  const clock = new FakeClock();
  const api = seededApi(clock);
  return { clock, api };
}

describe('runAgentOnPr', () => {
  it('happy path: relays 2 progress events, starts once, returns the findings worst first', async () => {
    const { clock, api } = setup();
    api.events = eventsOf(runEvent(1, 'info', 'fetching diff'), runEvent(2, 'llm', 'calling model'));
    api.runsSequence = [[run({ status: 'done' })]];
    api.reviews = [
      review({
        findings: [
          finding({ id: 'a', severity: 'SUGGESTION', title: 'minor' }),
          finding({ id: 'b', severity: 'CRITICAL', title: 'major' }),
        ],
      }),
    ];
    const progress: Array<[number, string]> = [];

    const out = await clock.run(
      runAgentOnPr({ api, clock }, INPUT, { onProgress: (n, m) => progress.push([n, m]) }),
    );

    expect(out.status).toBe('done');
    expect(out.runId).toBe(RUN_ID);
    expect(out.attached).toBe(false);
    expect(out.verdict).toBe('request_changes');
    expect(out.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'SUGGESTION']);
    expect(progress).toEqual([
      [1, 'info: fetching diff'],
      [2, 'llm: calling model'],
    ]);
    expect(api.count('startReview')).toBe(1);
    expect(api.of('startReview')[0]?.args).toEqual([PR_ID, AGENT_SECURITY_ID]);
  });

  it('sends each request with its planned timeout', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run()]];
    api.reviews = [review()];
    await clock.run(runAgentOnPr({ api, clock }, INPUT));
    expect(api.of('listRepos')[0]?.timeoutMs).toBe(5_000);
    expect(api.of('listAgents')[0]?.timeoutMs).toBe(5_000);
    expect(api.of('listPulls')[0]?.timeoutMs).toBe(15_000);
    expect(api.of('activeRuns')[0]?.timeoutMs).toBe(5_000);
    expect(api.of('startReview')[0]?.timeoutMs).toBe(10_000);
  });

  it('SSE never ends: returns status running with the run id within the 110 s budget', async () => {
    const { clock, api } = setup();
    api.events = neverEndingEvents();
    api.runsSequence = [[run({ status: 'running', duration_ms: null, cost_usd: null })]];
    const t0 = clock.now();

    const out = await clock.run(runAgentOnPr({ api, clock }, INPUT));

    expect(out.status).toBe('running');
    expect(out.runId).toBe(RUN_ID);
    expect(clock.now() - t0).toBeLessThanOrEqual(110_000);
    expect(clock.now() - t0).toBeGreaterThanOrEqual(100_000); // it did wait for the run
    expect(api.count('startReview')).toBe(1);
    const text = renderRunOutcome(out, 'concise');
    expect(text).toContain('status running');
    expect(text).toContain(RUN_ID);
    expect(text).toContain('Next: get_findings');
  });

  it('stays inside the budget even when each confirmation read is slow to be clipped', async () => {
    const { clock, api } = setup();
    api.events = neverEndingEvents();
    api.runsSequence = [[run({ status: 'running' })]];
    const t0 = clock.now();
    await clock.run(runAgentOnPr({ api, clock }, INPUT));
    for (const c of [...api.of('listRuns'), ...api.of('listReviews')]) {
      expect(c.timeoutMs).toBeLessThanOrEqual(8_000);
      expect(c.timeoutMs).toBeGreaterThan(0);
      expect((c.at ?? 0) - t0 + c.timeoutMs).toBeLessThanOrEqual(110_000);
    }
  });

  it('stream ends at 5 s while runs stay running for 2 polls: polls 3 s apart, then done', async () => {
    const { clock, api } = setup();
    api.events = endsAfter(clock, 5_000);
    api.runsSequence = [
      [run({ status: 'running' })],
      [run({ status: 'running' })],
      [run({ status: 'done' })],
    ];
    api.reviews = [review({ findings: [finding()] })];
    const t0 = clock.now();

    const out = await clock.run(runAgentOnPr({ api, clock }, INPUT));

    expect(out.status).toBe('done');
    const polls = api.of('listRuns').slice(0, 3).map((c) => (c.at ?? 0) - t0);
    expect(polls).toEqual([5_000, 8_000, 11_000]);
  });

  it('attaches to a running run of the same agent instead of starting a second one', async () => {
    const { clock, api } = setup();
    api.active = [{ run_id: OTHER_RUN_ID, agent_id: AGENT_SECURITY_ID, agent_name: 'Security Reviewer' }];
    api.runsSequence = [[run({ run_id: OTHER_RUN_ID, status: 'done' })]];
    api.reviews = [review({ run_id: OTHER_RUN_ID })];

    const out = await clock.run(runAgentOnPr({ api, clock }, INPUT));

    expect(api.count('startReview')).toBe(0);
    expect(out.runId).toBe(OTHER_RUN_ID);
    expect(out.attached).toBe(true);
    expect(renderRunOutcome(out, 'concise')).toContain('attached to a run already in progress');
  });

  it('does not attach to a running run of a different agent', async () => {
    const { clock, api } = setup();
    api.active = [{ run_id: OTHER_RUN_ID, agent_id: AGENT_GENERAL_ID, agent_name: 'General Reviewer' }];
    api.runsSequence = [[run()]];
    api.reviews = [review()];

    const out = await clock.run(runAgentOnPr({ api, clock }, INPUT));

    expect(api.count('startReview')).toBe(1);
    expect(out.attached).toBe(false);
    expect(out.runId).toBe(RUN_ID);
  });

  it('propagates a rate_limited error from startReview', async () => {
    const { clock, api } = setup();
    const err = new DevDigestError('rate_limited', { operation: 'start the review', retryAfterS: 30 });
    api.failures.startReview = err;

    const caught = await clock.run(runAgentOnPr({ api, clock }, INPUT)).catch((e: unknown) => e);

    expect(caught).toBe(err);
    expect(renderError(caught, { baseUrl: 'http://x' })).toContain('rate limit');
  });

  it('reports a failed run with its error text in the detailed rendering', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ status: 'failed', error: 'boom', cost_usd: null })]];
    api.reviews = [];

    const out = await clock.run(runAgentOnPr({ api, clock }, INPUT));

    expect(out.status).toBe('failed');
    expect(renderRunOutcome(out, 'detailed')).toContain('boom');
    expect(renderRunOutcome(out, 'concise')).not.toContain('boom');
  });

  it('returns status running with a note when the confirmation reads fail', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ status: 'done' })]];
    api.failures.listReviews = new DevDigestError('timeout', { route: 'GET /pulls/:id/reviews', timeoutS: 8 });

    const out = await clock.run(runAgentOnPr({ api, clock }, INPUT));

    expect(out.status).toBe('running');
    expect(out.runId).toBe(RUN_ID);
    expect(out.note).toBeTruthy();
  });

  it('a client cancel aborts the wait, rejects, and starts nothing else', async () => {
    const { clock, api } = setup();
    const ctl = new AbortController();
    const never = neverEndingEvents();
    api.events = (id, opts) => {
      queueMicrotask(() => ctl.abort());
      return never(id, opts);
    };

    const t0 = clock.now();

    const caught = await clock
      .run(runAgentOnPr({ api, clock }, INPUT, { signal: ctl.signal }))
      .catch((e: unknown) => e);

    expect(clock.now() - t0).toBeLessThan(1_000); // it did not sit out the 102 s wait
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('AbortError');
    expect(api.count('startReview')).toBe(1);
    expect(api.count('listReviews')).toBe(0);
  });

  it('rejects a bad pr reference before any API call', async () => {
    const { clock, api } = setup();
    const caught = await clock.run(runAgentOnPr({ api, clock }, { ...INPUT, pr: '482' })).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(DevDigestError);
    expect(api.calls).toHaveLength(0);
  });
});
