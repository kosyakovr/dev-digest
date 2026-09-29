/**
 * WP8.tests — `runReview` as a plain function, no SDK (onion-architecture §9
 * by analogy).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';
import { Resolver } from '../../src/resolve.js';
import { runReview } from '../../src/use-cases/run-review.js';
import { GR_ID, GR_NAME, PR_ID, RUN_ID, waitFor, makeFake } from '../helpers/fixtures.js';

const input = { pr: 'acme/payments-api#482', agent: 'General Reviewer', limit: 10 };

function scriptStartReview(fake: FakeDevDigestApi): void {
  fake.script('startReview', {
    value: { pr_id: PR_ID, runs: [{ run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME }] },
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
});
