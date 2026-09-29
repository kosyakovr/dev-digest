/**
 * WP8.tests — `runReview` as a plain function, no SDK (onion-architecture §9
 * by analogy).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';
import { Resolver } from '../../src/resolve.js';
import { runReview } from '../../src/use-cases/run-review.js';
import { StaleIdError } from '../../src/errors.js';
import { RunReviewOutput } from '../../src/contracts.js';
import { GR_ID, GR_NAME, PR_ID, RUN_ID, waitFor, makeFake } from '../helpers/fixtures.js';

const input = { pr: 'acme/payments-api#482', agent: 'General Reviewer', limit: 10 };

function scriptStartReview(fake: FakeDevDigestApi): void {
  fake.script('startReview', {
    value: { run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME },
  });
}

describe('runReview (use case, no SDK)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns status:"running" at the deadline when the stream never closes, with one onProgress call per event (no throttling)', async () => {
    vi.useFakeTimers();
    const fake = makeFake();
    scriptStartReview(fake);
    fake.scriptStream({
      kind: 'events',
      events: [
        { atMs: 0, event: { seq: 1, kind: 'info', msg: 'a' } },
        { atMs: 100, event: { seq: 2, kind: 'info', msg: 'b' } },
        { atMs: 200, event: { seq: 3, kind: 'info', msg: 'c' } },
      ],
    });
    fake.runs[PR_ID] = [
      { run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME, status: 'running', error: null, duration_ms: null, cost_usd: null, findings_count: null },
    ];

    const messages: string[] = [];
    const controller = new AbortController();
    const resultPromise = runReview(
      { api: fake, resolver: new Resolver(fake) },
      input,
      { signal: controller.signal, onProgress: (m) => messages.push(m), deadlineMs: 100_000 },
    );
    await vi.advanceTimersByTimeAsync(100_000);
    const result = await resultPromise;

    expect(result).toMatchObject({ status: 'running', run_id: RUN_ID });
    expect(messages).toEqual(['General Reviewer: a', 'General Reviewer: b', 'General Reviewer: c']);
  });

  it('returns null and makes no further port call when the caller aborts mid-stream', async () => {
    const fake = makeFake();
    scriptStartReview(fake);
    fake.scriptStream({ kind: 'never' });

    const controller = new AbortController();
    const resultPromise = runReview(
      { api: fake, resolver: new Resolver(fake) },
      input,
      { signal: controller.signal },
    );
    await waitFor(() => fake.calls.some((c) => c.method === 'streamRunEvents'));
    controller.abort();

    const result = await resultPromise;

    expect(result).toBeNull();
    const streamIndex = fake.calls.findIndex((c) => c.method === 'streamRunEvents');
    expect(fake.calls.slice(streamIndex + 1)).toEqual([]);
  }, 10_000);

  it('the done output parses with RunReviewOutput (backend-architecture-1)', async () => {
    const fake = makeFake();
    scriptStartReview(fake);
    fake.scriptStream({ kind: 'events', events: [], closeAtMs: 10 });
    fake.runs[PR_ID] = [
      { run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME, status: 'done', error: null, duration_ms: 10, cost_usd: 0, findings_count: 0 },
    ];
    fake.reviews[PR_ID] = [
      { id: 'rev1', run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME, kind: 'review', verdict: 'comment', summary: null, score: 100, model: 'gpt-4o', created_at: '2024-01-01T00:00:00Z', findings: [] },
    ];

    const result = await runReview({ api: fake, resolver: new Resolver(fake) }, input, {
      signal: new AbortController().signal,
    });

    expect(RunReviewOutput.safeParse(result).success).toBe(true);
  });

  // generic-1-2 — a StaleIdError from startReview (the cached pr/agent id no
  // longer exists) recovers via invalidate + re-resolve + retry once; the
  // retry only ever happens before a successful POST, so run_review never
  // retries again after that (spec § Resolver § cache invalidation).
  describe('startReview cache-staleness recovery (generic-1-2)', () => {
    it('invalidates, re-resolves, and retries once on a StaleIdError from startReview, then succeeds', async () => {
      const fake = makeFake();
      fake.script('startReview', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/review`) });
      scriptStartReview(fake); // consumed by the retry
      fake.scriptStream({ kind: 'events', events: [], closeAtMs: 10 });
      fake.runs[PR_ID] = [
        { run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME, status: 'done', error: null, duration_ms: 10, cost_usd: 0, findings_count: 0 },
      ];
      fake.reviews[PR_ID] = [
        { id: 'rev1', run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME, kind: 'review', verdict: 'comment', summary: null, score: 100, model: 'gpt-4o', created_at: '2024-01-01T00:00:00Z', findings: [] },
      ];

      const result = await runReview({ api: fake, resolver: new Resolver(fake) }, input, {
        signal: new AbortController().signal,
      });

      expect(result?.status).toBe('done');
      expect(fake.calls.filter((c) => c.method === 'startReview')).toHaveLength(2);
      expect(fake.calls.filter((c) => c.method === 'listRepos')).toHaveLength(2);
      expect(fake.calls.filter((c) => c.method === 'listAgents')).toHaveLength(2);
    });

    it('surfaces the E10 text on a second consecutive StaleIdError from startReview (no further retry)', async () => {
      const fake = makeFake();
      fake.script('startReview', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/review`) });
      fake.script('startReview', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/review`) });

      await expect(
        runReview({ api: fake, resolver: new Resolver(fake) }, input, { signal: new AbortController().signal }),
      ).rejects.toThrow(`No DevDigest PR with id ${PR_ID}. Use owner/repo#123 instead.`);

      expect(fake.calls.filter((c) => c.method === 'startReview')).toHaveLength(2);
    });

    it('never retries after a successful startReview — a later StaleIdError (listRuns) is not caught', async () => {
      const fake = makeFake();
      scriptStartReview(fake); // succeeds on the first attempt
      fake.scriptStream({ kind: 'events', events: [], closeAtMs: 10 });
      fake.script('listRuns', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/runs`) });

      await expect(
        runReview({ api: fake, resolver: new Resolver(fake) }, input, { signal: new AbortController().signal }),
      ).rejects.toThrow(`No DevDigest PR with id ${PR_ID}. Use owner/repo#123 instead.`);

      expect(fake.calls.filter((c) => c.method === 'startReview')).toHaveLength(1);
    });

    // generic-1-6 — the StaleIdError retry re-resolves through the SAME
    // resolveUnderBudget helper used before the first POST (spec Tool 2 §
    // Timing, § Resolver § cache invalidation), so a deadline abort or an
    // exhausted budget during re-resolution surfaces E19 with no second
    // startReview, and a caller abort during re-resolution still returns
    // null — never a bare "Cancelled." escaping the E19 mapping.
    it('a deadline abort during the retry re-resolution surfaces E19 and makes no second startReview call (generic-1-6)', async () => {
      vi.useFakeTimers();
      const fake = makeFake();
      fake.script('startReview', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/review`) });
      // First resolveUnderBudget (before the failing POST) resolves fast;
      // the retry's re-resolution (after invalidate()) is still in flight
      // when the 1 s deadline fires.
      fake.script('listRepos', { delayMs: 0 });
      fake.script('listRepos', { delayMs: 5_000 });

      const resultPromise = runReview({ api: fake, resolver: new Resolver(fake) }, input, {
        signal: new AbortController().signal,
        deadlineMs: 1_000,
        confirmTimeoutMs: 100,
      });
      // Attach the rejection assertion BEFORE advancing timers, so it settles
      // the promise the instant it rejects — otherwise fake-timer advancement
      // can reject `resultPromise` in the same tick Node checks for unhandled
      // rejections, before the `await expect(...).rejects` line below runs.
      const assertion = expect(resultPromise).rejects.toThrow(
        'Resolving acme/payments-api#482 took longer than the 1 s budget allows (GitHub sync). No review was started; retry.',
      );
      await vi.advanceTimersByTimeAsync(1_500);
      await assertion;

      expect(fake.calls.filter((c) => c.method === 'startReview')).toHaveLength(1);
    });

    it('a retry re-resolution finishing with less than confirmTimeoutMs left surfaces E19 and makes no second startReview call (generic-1-6)', async () => {
      vi.useFakeTimers();
      const fake = makeFake();
      fake.script('startReview', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/review`) });
      // The retry's re-resolution finishes at ~1.75 s — inside the 2 s
      // deadline (no abort), but past the 1.7 s budget threshold (2 s
      // deadline - 300 ms confirmTimeoutMs).
      fake.script('listRepos', { delayMs: 0 });
      fake.script('listRepos', { delayMs: 1_750 });

      const resultPromise = runReview({ api: fake, resolver: new Resolver(fake) }, input, {
        signal: new AbortController().signal,
        deadlineMs: 2_000,
        confirmTimeoutMs: 300,
      });
      const assertion = expect(resultPromise).rejects.toThrow(
        'Resolving acme/payments-api#482 took longer than the 2 s budget allows (GitHub sync). No review was started; retry.',
      );
      await vi.advanceTimersByTimeAsync(1_900);
      await assertion;

      expect(fake.calls.filter((c) => c.method === 'startReview')).toHaveLength(1);
    });

    it('returns null and makes no further port call when the caller aborts during the retry re-resolution (generic-1-6)', async () => {
      const fake = makeFake();
      fake.script('startReview', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/review`) });
      fake.script('listRepos', { delayMs: 0 });
      fake.script('listRepos', { delayMs: 500 });

      const controller = new AbortController();
      const resultPromise = runReview({ api: fake, resolver: new Resolver(fake) }, input, {
        signal: controller.signal,
      });
      await waitFor(() => fake.calls.filter((c) => c.method === 'listRepos').length === 2);
      controller.abort();

      const result = await resultPromise;

      expect(result).toBeNull();
      expect(fake.calls.filter((c) => c.method === 'startReview')).toHaveLength(1);
      expect(fake.calls.filter((c) => c.method === 'listPulls')).toHaveLength(1);
      expect(fake.calls.filter((c) => c.method === 'listAgents')).toHaveLength(1);
    }, 10_000);
  });
});
