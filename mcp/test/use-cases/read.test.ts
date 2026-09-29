/**
 * WP7.tests — the read use cases run without the SDK, `fetch`, or an
 * `McpServer` (onion-architecture §9 by analogy, AC-16).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';
import { Resolver } from '../../src/resolve.js';
import { listAgents } from '../../src/use-cases/list-agents.js';
import { getFindings } from '../../src/use-cases/get-findings.js';
import { getConventions } from '../../src/use-cases/get-conventions.js';
import { StaleIdError, StaleRepoIdError } from '../../src/errors.js';
import { ListAgentsOutput, GetFindingsOutput, GetConventionsOutput } from '../../src/contracts.js';
import { GR_ID, GR_NAME, PR_ID, PR_LABEL, PR_NUMBER, PR_TITLE, REPO_FULL_NAME, REPO_ID, RUN_ID, makeFake } from '../helpers/fixtures.js';

describe('use cases run without the SDK, fetch or an McpServer', () => {
  it('listAgents returns the projected agents list', async () => {
    const fake = new FakeDevDigestApi();
    fake.agents = [{ id: GR_ID, name: GR_NAME, model: 'gpt-4o', enabled: true }];
    const resolver = new Resolver(fake);

    const out = await listAgents({ resolver }, { response_format: 'concise' }, new AbortController().signal);

    expect(out).toEqual({ agents: [{ id: GR_ID, name: GR_NAME, enabled: true, model: 'gpt-4o' }], count: 1 });
  });

  it('getFindings resolves the pr and returns its (empty) findings', async () => {
    const fake = makeFake();
    fake.reviews[PR_ID] = [];
    const resolver = new Resolver(fake);

    const out = await getFindings(
      { api: fake, resolver },
      { pr: 'acme/payments-api#482', limit: 20, response_format: 'concise' },
      new AbortController().signal,
    );

    expect(out).toMatchObject({ pr: PR_LABEL, pr_title: PR_TITLE, reviews: [], findings: [], total: 0 });
  });

  it('getConventions resolves the repo and returns its (empty) conventions', async () => {
    const fake = makeFake();
    fake.conventions[REPO_ID] = [];
    const resolver = new Resolver(fake);

    const out = await getConventions(
      { api: fake, resolver },
      { repo: 'acme/payments-api', status: 'accepted', response_format: 'concise' },
      new AbortController().signal,
    );

    expect(out).toMatchObject({ repo: REPO_FULL_NAME, conventions: [], total: 0 });
  });

  // backend-architecture-1 — each use case's actual return value must parse
  // with the contracts.ts schema that is now its declared output type.
  it('listAgents / getFindings / getConventions outputs each parse with their contracts.ts schema (backend-architecture-1)', async () => {
    const fake = makeFake();
    fake.reviews[PR_ID] = [];
    fake.conventions[REPO_ID] = [];
    const resolver = new Resolver(fake);

    const agentsOut = await listAgents({ resolver }, { response_format: 'detailed' }, new AbortController().signal);
    const findingsOut = await getFindings(
      { api: fake, resolver },
      { pr: 'acme/payments-api#482', limit: 20, response_format: 'detailed' },
      new AbortController().signal,
    );
    const conventionsOut = await getConventions(
      { api: fake, resolver },
      { repo: 'acme/payments-api', status: 'accepted', response_format: 'detailed' },
      new AbortController().signal,
    );

    expect(ListAgentsOutput.safeParse(agentsOut).success).toBe(true);
    expect(GetFindingsOutput.safeParse(findingsOut).success).toBe(true);
    expect(GetConventionsOutput.safeParse(conventionsOut).success).toBe(true);
  });

  // generic-1-2 — getFindings recovers from a StaleIdError (cached PR id
  // gone) on its initial listReviews call via invalidate + re-resolve +
  // retry once; a second failure surfaces the E10 text (spec § Resolver §
  // cache invalidation).
  describe('getFindings recovers from a stale cached PR id (generic-1-2)', () => {
    it('invalidates, re-resolves, and retries once on a StaleIdError from listReviews, resolving under the PR\'s new id', async () => {
      const fake = makeFake();
      const resolver = new Resolver(fake);
      // Warm the resolver's PR cache under the OLD id, as it would be after
      // an earlier call in the same process — the stale id (generic-2-6)
      // must come from a real cache/refetch mismatch, not just a differently
      // shaped fixture the fallback happens to already match.
      await resolver.pr('acme/payments-api#482');

      const NEW_PR_ID = 'aabbccdd-1111-4aaa-8aaa-aabbccddeeff';
      fake.script('listReviews', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/reviews`) });
      fake.pulls = { [REPO_ID]: [{ id: NEW_PR_ID, number: PR_NUMBER, title: PR_TITLE }] };
      fake.reviews[NEW_PR_ID] = [];

      const out = await getFindings(
        { api: fake, resolver },
        { pr: 'acme/payments-api#482', limit: 20, response_format: 'concise' },
        new AbortController().signal,
      );

      expect(out).toMatchObject({ pr: PR_LABEL, reviews: [], findings: [], total: 0 });
      const listReviewsCalls = fake.calls.filter((c) => c.method === 'listReviews');
      expect(listReviewsCalls.map((c) => c.args)).toEqual([[PR_ID], [NEW_PR_ID]]);
      expect(fake.calls.filter((c) => c.method === 'listRepos')).toHaveLength(2);
    });

    it('surfaces the E10 text on a second consecutive StaleIdError from listReviews', async () => {
      const fake = makeFake();
      fake.script('listReviews', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/reviews`) });
      fake.script('listReviews', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/reviews`) });
      const resolver = new Resolver(fake);

      await expect(
        getFindings(
          { api: fake, resolver },
          { pr: 'acme/payments-api#482', limit: 20, response_format: 'concise' },
          new AbortController().signal,
        ),
      ).rejects.toThrow(`No DevDigest PR with id ${PR_ID}. Use owner/repo#123 instead.`);
    });

    it('invalidates, re-resolves, and retries once on a StaleIdError from the run_id-miss listRuns fallback, resolving under the PR\'s new id', async () => {
      const fake = makeFake();
      fake.reviews[PR_ID] = [];
      const resolver = new Resolver(fake);
      await resolver.pr('acme/payments-api#482'); // warm the cache under the OLD PR id

      const NEW_PR_ID = 'aabbccdd-2222-4aaa-8aaa-aabbccddeeff';
      fake.script('listRuns', { error: new StaleIdError(PR_ID, `/pulls/${PR_ID}/runs`) });
      // Keep PR_ID "known" via `prs` (only listRuns is under test here — the
      // resolveAndListReviews call ahead of it must resolve PR_ID from the
      // warm cache and its own unscripted listReviews(PR_ID) call must not
      // itself go stale) while the PR list under the repo only has the new
      // id, so the resolver's post-invalidate refetch picks up NEW_PR_ID.
      fake.prs[PR_ID] = { id: PR_ID, number: PR_NUMBER, title: PR_TITLE };
      fake.pulls = { [REPO_ID]: [{ id: NEW_PR_ID, number: PR_NUMBER, title: PR_TITLE }] };
      fake.reviews[NEW_PR_ID] = [];
      fake.runs[NEW_PR_ID] = [
        { run_id: RUN_ID, agent_id: GR_ID, agent_name: GR_NAME, status: 'running', error: null, duration_ms: null, cost_usd: null, findings_count: null },
      ];

      const out = await getFindings(
        { api: fake, resolver },
        { pr: 'acme/payments-api#482', run_id: RUN_ID, limit: 20, response_format: 'concise' },
        new AbortController().signal,
      );

      expect(out).toMatchObject({ status: 'running', run_id: RUN_ID });
      const listRunsCalls = fake.calls.filter((c) => c.method === 'listRuns');
      expect(listRunsCalls.map((c) => c.args)).toEqual([[PR_ID], [NEW_PR_ID]]);
      expect(fake.calls.filter((c) => c.method === 'listRepos')).toHaveLength(2);
    });
  });

  // generic-1-2 (repo) — getConventions recovers from a StaleRepoIdError
  // (cached repo id gone) via invalidate + re-resolve + retry once.
  describe('getConventions recovers from a stale cached repo id (generic-1-2 repo)', () => {
    it('invalidates, re-resolves, and retries once on a StaleRepoIdError from listConventions, resolving under the repo\'s new id', async () => {
      const fake = makeFake();
      const resolver = new Resolver(fake);
      await resolver.repo('acme/payments-api'); // warm the cache under the OLD repo id

      const NEW_REPO_ID = '99999999-9999-4999-8999-999999999999';
      fake.script('listConventions', { error: new StaleRepoIdError(REPO_ID, `/repos/${REPO_ID}/conventions`) });
      fake.repos = [{ id: NEW_REPO_ID, full_name: REPO_FULL_NAME }];
      fake.conventions[NEW_REPO_ID] = [];

      const out = await getConventions(
        { api: fake, resolver },
        { repo: 'acme/payments-api', status: 'accepted', response_format: 'concise' },
        new AbortController().signal,
      );

      expect(out).toMatchObject({ repo: REPO_FULL_NAME, conventions: [], total: 0 });
      const listConventionsCalls = fake.calls.filter((c) => c.method === 'listConventions');
      expect(listConventionsCalls.map((c) => c.args)).toEqual([[REPO_ID], [NEW_REPO_ID]]);
      expect(fake.calls.filter((c) => c.method === 'listRepos')).toHaveLength(2);
    });

    it('surfaces the id-only repo text on a second consecutive StaleRepoIdError', async () => {
      const fake = makeFake();
      fake.script('listConventions', { error: new StaleRepoIdError(REPO_ID, `/repos/${REPO_ID}/conventions`) });
      fake.script('listConventions', { error: new StaleRepoIdError(REPO_ID, `/repos/${REPO_ID}/conventions`) });
      const resolver = new Resolver(fake);

      await expect(
        getConventions(
          { api: fake, resolver },
          { repo: 'acme/payments-api', status: 'accepted', response_format: 'concise' },
          new AbortController().signal,
        ),
      ).rejects.toThrow(`No DevDigest repo with id ${REPO_ID}. Use owner/repo instead.`);
    });
  });

  it('never imports the SDK or calls fetch(...) — use-cases/*.ts, resolve.ts, format.ts (AC-16)', () => {
    const srcRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../src');
    const files = [
      'resolve.ts',
      'format.ts',
      ...readdirSync(path.join(srcRoot, 'use-cases')).map((f) => `use-cases/${f}`),
    ];

    for (const relative of files) {
      const text = readFileSync(path.join(srcRoot, relative), 'utf8');
      expect(text, `${relative} must not mention @modelcontextprotocol`).not.toMatch(/@modelcontextprotocol/);
      expect(text, `${relative} must not call fetch(...)`).not.toMatch(/(^|[^A-Za-z_.])fetch\(/);
    }
  });
});
