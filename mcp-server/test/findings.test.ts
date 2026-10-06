import { describe, expect, it } from 'vitest';
import { renderError, renderFindings } from '../src/format/text.ts';
import { getFindings } from '../src/usecases/findings.ts';
import type { FindingsInput } from '../src/usecases/findings.ts';
import {
  AGENT_GENERAL_ID,
  FakeClock,
  finding,
  OTHER_RUN_ID,
  review,
  run,
  RUN_ID,
  seededApi,
} from './fakes.ts';

const BASE: FindingsInput = {
  pr: 'acme/payments-api#482',
  min_severity: 'SUGGESTION',
  limit: 20,
  offset: 0,
};

function setup() {
  const clock = new FakeClock();
  return { clock, api: seededApi(clock) };
}

const finds = (text: string) => text.split('\n').filter((l) => /^\[(CRITICAL|WARNING|SUGGESTION)\] /.test(l));

describe('getFindings', () => {
  it('without any review fails with no_review and points at run_agent_on_pr', async () => {
    const { clock, api } = setup();
    const err = await getFindings({ api, clock }, BASE).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'no_review' });
    const text = renderError(err, { baseUrl: 'http://x' });
    expect(text).toBe('No finished review on acme/payments-api#482 yet. Run run_agent_on_pr first.');
  });

  it('an agent filter that matches no review fails with no_review naming the agent', async () => {
    const { clock, api } = setup();
    api.reviews = [review({ findings: [finding()] })];
    const err = await getFindings({ api, clock }, { ...BASE, agent: 'General Reviewer' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'no_review' });
    expect(renderError(err, { baseUrl: 'http://x' })).toBe(
      'No finished review by "General Reviewer" on acme/payments-api#482 yet. Run run_agent_on_pr first.',
    );
  });

  it('a run_id that is neither a run nor a review of the PR fails with run_not_found', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ run_id: RUN_ID })]];
    api.reviews = [review({ run_id: RUN_ID })];
    const err = await getFindings({ api, clock }, { ...BASE, run_id: OTHER_RUN_ID }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'run_not_found' });
    const text = renderError(err, { baseUrl: 'http://x' });
    expect(text).toBe(
      `No run ${OTHER_RUN_ID} on acme/payments-api#482. Call get_findings without run_id for the latest review.`,
    );
    expect(text).not.toContain('Check the repo');
  });

  it('with a run_id whose run is still running reports status running and a get_findings hint', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ status: 'running' })]];
    const view = await getFindings({ api, clock }, { ...BASE, run_id: RUN_ID });
    expect(view.reviews[0]?.status).toBe('running');
    const text = renderFindings(view, 'concise');
    expect(text).toContain('status running');
    expect(text).toContain('Next: get_findings');
    expect(text).toContain(RUN_ID);
  });

  it('selects the review of the given run_id, not the newest one', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ run_id: RUN_ID }), run({ run_id: OTHER_RUN_ID })]];
    api.reviews = [
      review({ id: 'new', run_id: OTHER_RUN_ID, findings: [finding({ id: 'n', title: 'from newest' })] }),
      review({ id: 'old', run_id: RUN_ID, findings: [finding({ id: 'o', title: 'from the asked run' })] }),
    ];
    const text = renderFindings(await getFindings({ api, clock }, { ...BASE, run_id: RUN_ID }), 'concise');
    expect(text).toContain('from the asked run');
    expect(text).not.toContain('from newest');
  });

  it('hides dismissed findings and prints their count', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        findings: [
          finding({ id: '1', title: 'one' }),
          finding({ id: '2', title: 'two', start_line: 20 }),
          finding({ id: '3', title: 'gone', dismissed_at: '2026-10-01T00:00:00Z' }),
        ],
      }),
    ];
    const text = renderFindings(await getFindings({ api, clock }, BASE), 'concise');
    expect(finds(text)).toHaveLength(2);
    expect(text).not.toContain('gone');
    expect(text).toContain('1 dismissed finding(s) hidden');
  });

  it('min_severity WARNING drops suggestions', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        findings: [
          finding({ id: '1', severity: 'CRITICAL', title: 'c' }),
          finding({ id: '2', severity: 'WARNING', title: 'w' }),
          finding({ id: '3', severity: 'SUGGESTION', title: 's' }),
        ],
      }),
    ];
    const text = renderFindings(await getFindings({ api, clock }, { ...BASE, min_severity: 'WARNING' }), 'concise');
    expect(text).not.toContain('[SUGGESTION]');
    expect(finds(text).map((l) => l.split(' ')[0])).toEqual(['[CRITICAL]', '[WARNING]']);
  });

  it('pages: limit 2 of 5 shows 2 lines and the next offset', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        findings: Array.from({ length: 5 }, (_, i) =>
          finding({ id: `f${i}`, title: `t${i}`, start_line: i + 1 }),
        ),
      }),
    ];
    const text = renderFindings(await getFindings({ api, clock }, { ...BASE, limit: 2 }), 'concise');
    expect(finds(text)).toHaveLength(2);
    expect(text).toContain('offset=2');
  });

  it('offset skips the first findings of the sorted list', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        findings: Array.from({ length: 3 }, (_, i) =>
          finding({ id: `f${i}`, title: `t${i}`, start_line: i + 1 }),
        ),
      }),
    ];
    const text = renderFindings(await getFindings({ api, clock }, { ...BASE, offset: 2 }), 'concise');
    expect(finds(text)).toHaveLength(1);
    expect(text).toContain('"t2"');
  });

  it('sorts by severity, then file, then start line', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        findings: [
          finding({ id: '1', severity: 'WARNING', file: 'b.ts', start_line: 1, title: 'w-b1' }),
          finding({ id: '2', severity: 'CRITICAL', file: 'z.ts', start_line: 9, title: 'c-z9' }),
          finding({ id: '3', severity: 'WARNING', file: 'a.ts', start_line: 30, title: 'w-a30' }),
          finding({ id: '4', severity: 'WARNING', file: 'a.ts', start_line: 5, title: 'w-a5' }),
        ],
      }),
    ];
    const view = await getFindings({ api, clock }, BASE);
    expect(view.reviews[0]?.findings.map((f) => f.title)).toEqual(['c-z9', 'w-a5', 'w-a30', 'w-b1']);
  });

  it('still returns the newest review when its run_id is null', async () => {
    const { clock, api } = setup();
    api.reviews = [review({ run_id: null, findings: [finding({ title: 'seeded' })] })];
    const view = await getFindings({ api, clock }, BASE);
    expect(view.reviews[0]?.status).toBe('done');
    expect(view.reviews[0]?.runId).toBeNull();
    const text = renderFindings(view, 'concise');
    expect(text).toContain('run none');
    expect(text).toContain('"seeded"');
  });

  it('filters the latest review by agent when asked', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({ id: 'sec', findings: [finding({ title: 'security one' })] }),
      review({
        id: 'gen',
        agent_id: AGENT_GENERAL_ID,
        agent_name: 'General Reviewer',
        findings: [finding({ title: 'general one' })],
      }),
    ];
    const text = renderFindings(
      await getFindings({ api, clock }, { ...BASE, agent: 'general reviewer' }),
      'concise',
    );
    expect(text).toContain('general one');
    expect(text).not.toContain('security one');
  });

  it('ignores reviews that are not kind review', async () => {
    const { clock, api } = setup();
    api.reviews = [review({ kind: 'comment', findings: [finding({ title: 'not a review' })] })];
    const err = await getFindings({ api, clock }, BASE).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'no_review' });
    expect(renderError(err, { baseUrl: 'http://x' })).toContain('run_agent_on_pr');
  });

  it('shows "cost unknown" for a null cost, never $0', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ cost_usd: null })]];
    api.reviews = [review({ findings: [finding()] })];
    const text = renderFindings(await getFindings({ api, clock }, BASE), 'concise');
    expect(text).toContain('cost unknown');
    expect(text).not.toContain('$0');
  });

  it('shows a known cost as $x.xxxx', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ cost_usd: 0.0123 })]];
    api.reviews = [review({ findings: [finding()] })];
    const text = renderFindings(await getFindings({ api, clock }, BASE), 'concise');
    expect(text).toContain('$0.0123');
  });

  it('shows the newest review of every agent with total_findings (AC-4b)', async () => {
    const { clock, api } = setup();
    api.runsSequence = [[run({ run_id: RUN_ID }), run({ run_id: OTHER_RUN_ID, agent_id: AGENT_GENERAL_ID })]];
    // The API lists reviews newest first.
    api.reviews = [
      review({ id: 'sec-new', findings: [finding({ id: 's1', severity: 'CRITICAL', title: 'security new' })] }),
      review({
        id: 'gen',
        run_id: OTHER_RUN_ID,
        agent_id: AGENT_GENERAL_ID,
        agent_name: 'General Reviewer',
        findings: [
          finding({ id: 'g1', title: 'general one' }),
          finding({ id: 'g2', severity: 'SUGGESTION', title: 'general two', start_line: 30, end_line: 30 }),
        ],
      }),
      review({ id: 'sec-old', run_id: null, findings: [finding({ id: 's0', title: 'security old' })] }),
    ];
    const view = await getFindings({ api, clock }, BASE);
    expect(view.reviews.map((r) => r.agentName)).toEqual(['Security Reviewer', 'General Reviewer']);
    expect(view.totalFindings).toBe(3);
    expect(view.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });

    const text = renderFindings(view, 'concise');
    expect(text.split('\n').slice(0, 2)).toEqual([
      'pr acme/payments-api#482 · 2 review(s) · total_findings 3',
      'CRITICAL 1 · WARNING 1 · SUGGESTION 1',
    ]);
    expect(text).toContain(`review 1/2 · run ${RUN_ID} · status done`);
    expect(text).toContain(`review 2/2 · run ${OTHER_RUN_ID} · status done`);
    expect(text).not.toContain('security old');
    expect(finds(text)).toEqual([
      '[CRITICAL] "src/a.ts:10-12" "security new"',
      '[WARNING] "src/a.ts:10-12" "general one"',
      '[SUGGESTION] "src/a.ts:30-30" "general two"',
    ]);
  });

  it('gives each review its own untrusted block, with its agent inside', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({ id: 'sec', findings: [finding({ title: 'security one' })] }),
      review({ id: 'gen', agent_id: AGENT_GENERAL_ID, agent_name: 'General Reviewer', findings: [finding({ title: 'general one' })] }),
    ];
    const lines = renderFindings(await getFindings({ api, clock }, BASE), 'concise').split('\n');
    const opens = lines.flatMap((l, i) => (l.startsWith('--- untrusted DevDigest data') ? [i] : []));
    const closes = lines.flatMap((l, i) => (l === '--- end untrusted data ---' ? [i] : []));
    expect(opens).toHaveLength(2);
    expect(closes).toHaveLength(2);
    const at = (s: string) => lines.findIndex((l) => l.includes(s));
    expect(at('"Security Reviewer"')).toBeGreaterThan(opens[0]!);
    expect(at('"security one"')).toBeLessThan(closes[0]!);
    expect(at('"General Reviewer"')).toBeGreaterThan(opens[1]!);
    expect(at('"general one"')).toBeLessThan(closes[1]!);
  });

  it('total_findings counts only non-dismissed findings at or above min_severity, over all reviews', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        id: 'sec',
        findings: [
          finding({ id: '1', severity: 'CRITICAL' }),
          finding({ id: '2', severity: 'SUGGESTION' }),
          finding({ id: '3', severity: 'WARNING', dismissed_at: '2026-10-01T00:00:00Z' }),
        ],
      }),
      review({
        id: 'gen',
        agent_id: AGENT_GENERAL_ID,
        agent_name: 'General Reviewer',
        findings: [finding({ id: '4', severity: 'WARNING' }), finding({ id: '5', severity: 'SUGGESTION' })],
      }),
    ];
    const view = await getFindings({ api, clock }, { ...BASE, min_severity: 'WARNING' });
    expect(view.totalFindings).toBe(2);
    expect(view.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    expect(renderFindings(view, 'concise')).toContain('1 dismissed finding(s) hidden');
  });

  it('pages across reviews: limit and offset run over the findings of all blocks in order', async () => {
    const { clock, api } = setup();
    const two = (p: string) => [
      finding({ id: `${p}1`, title: `${p}1`, start_line: 1 }),
      finding({ id: `${p}2`, title: `${p}2`, start_line: 2 }),
    ];
    api.reviews = [
      review({ id: 'sec', findings: two('s') }),
      review({ id: 'gen', agent_id: AGENT_GENERAL_ID, agent_name: 'General Reviewer', findings: two('g') }),
    ];
    const first = renderFindings(await getFindings({ api, clock }, { ...BASE, limit: 3 }), 'concise');
    expect(finds(first).map((l) => l.split(' ').pop())).toEqual(['"s1"', '"s2"', '"g1"']);
    expect(first).toContain('Truncated: showing 1-3 of 4. Call again with offset=3.');

    const rest = renderFindings(await getFindings({ api, clock }, { ...BASE, limit: 3, offset: 3 }), 'concise');
    expect(finds(rest).map((l) => l.split(' ').pop())).toEqual(['"g2"']);
    // The first agent's block keeps its header and counts though none of its findings is on the page.
    expect(rest).toContain(`review 1/2 · run ${RUN_ID} · status done`);
    expect(rest).toContain('"Security Reviewer"');
    expect(rest).not.toContain('Truncated');
  });

  it('with an agent filter returns that agent’s newest review only', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({ id: 'gen-new', agent_id: AGENT_GENERAL_ID, agent_name: 'General Reviewer', findings: [finding({ title: 'gen new' })] }),
      review({ id: 'sec', findings: [finding({ title: 'security one' })] }),
      review({ id: 'gen-old', agent_id: AGENT_GENERAL_ID, agent_name: 'General Reviewer', findings: [finding({ title: 'gen old' })] }),
    ];
    const view = await getFindings({ api, clock }, { ...BASE, agent: 'General Reviewer' });
    expect(view.reviews).toHaveLength(1);
    const text = renderFindings(view, 'concise');
    expect(text).toContain('1 review(s) · total_findings 1');
    expect(text).toContain('gen new');
    expect(text).not.toContain('gen old');
  });

  it('renders a finding line as [SEVERITY] "file:start-end" "title"', async () => {
    const { clock, api } = setup();
    api.reviews = [
      review({
        findings: [finding({ severity: 'CRITICAL', file: 'src/pay.ts', start_line: 40, end_line: 44, title: 'SQL injection' })],
      }),
    ];
    const text = renderFindings(await getFindings({ api, clock }, BASE), 'concise');
    expect(text).toContain('[CRITICAL] "src/pay.ts:40-44" "SQL injection"');
  });
});
