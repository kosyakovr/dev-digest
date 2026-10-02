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
    expect(view.status).toBe('running');
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
    expect(view.findings.map((f) => f.title)).toEqual(['c-z9', 'w-a5', 'w-a30', 'w-b1']);
  });

  it('still returns the newest review when its run_id is null', async () => {
    const { clock, api } = setup();
    api.reviews = [review({ run_id: null, findings: [finding({ title: 'seeded' })] })];
    const view = await getFindings({ api, clock }, BASE);
    expect(view.status).toBe('done');
    expect(view.runId).toBeNull();
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
