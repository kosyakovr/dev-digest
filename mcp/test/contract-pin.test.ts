/**
 * WP9.tests — pins each local wire schema (`src/contracts.ts`) against its
 * paired `@devdigest/shared` server contract (Contract § D2-O3, AC-13):
 * a fixture that satisfies the full server contract must also satisfy the
 * local, lenient schema, and every local key must exist on the server
 * contract. `vitest.config.ts` aliases `@devdigest/shared` to
 * `server/src/vendor/shared` and pins zod to this package's copy so both
 * schemas are instances of the same zod (R6).
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  Agent,
  ApiErrorBody,
  ConventionCandidate,
  FindingRecord,
  PrDetail,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  ReviewRunTarget,
  RunEvent,
  RunSummary,
} from '@devdigest/shared';
import {
  AgentWire,
  ApiErrorBodyWire,
  ConventionWire,
  FindingWire,
  PullDetailWire,
  PullListItemWire,
  RepoWire,
  ReviewRunResponseWire,
  ReviewRunTargetWire,
  ReviewWire,
  RunEventWire,
  RunSummaryWire,
} from '../src/contracts.js';

function assertPinned(
  label: string,
  local: z.AnyZodObject,
  contract: z.AnyZodObject,
  fixture: Record<string, unknown>,
): void {
  const contractResult = contract.safeParse(fixture);
  expect(contractResult.success, `${label}: fixture must satisfy the full server contract`).toBe(true);

  const localResult = local.safeParse(fixture);
  expect(localResult.success, `${label}: local wire schema must accept the same fixture`).toBe(true);

  const contractKeys = new Set(Object.keys(contract.shape));
  for (const key of Object.keys(local.shape)) {
    expect(contractKeys.has(key), `${label}: local key "${key}" is missing from the paired server contract`).toBe(
      true,
    );
  }
}

const findingFixture = {
  id: 'f1',
  severity: 'CRITICAL',
  category: 'bug',
  title: 'Title',
  file: 'a.ts',
  start_line: 1,
  end_line: 2,
  rationale: 'because',
  confidence: 0.9,
  review_id: 'rev1',
  accepted_at: null,
  dismissed_at: null,
};

describe('contract-pin', () => {
  it('AgentWire ⊆ Agent', () => {
    assertPinned('AgentWire/Agent', AgentWire, Agent, {
      id: 'a1',
      name: 'General Reviewer',
      description: 'd',
      provider: 'openai',
      model: 'gpt-4o',
      system_prompt: 'sp',
      enabled: true,
      version: 1,
    });
  });

  it('RepoWire ⊆ Repo', () => {
    assertPinned('RepoWire/Repo', RepoWire, Repo, {
      id: 'r1',
      workspace_id: 'w1',
      owner: 'acme',
      name: 'payments-api',
      full_name: 'acme/payments-api',
      default_branch: 'main',
      clone_path: null,
      last_polled_at: null,
      created_by: null,
    });
  });

  it('PullListItemWire ⊆ PrMeta', () => {
    assertPinned('PullListItemWire/PrMeta', PullListItemWire, PrMeta, {
      id: 'p1',
      number: 482,
      title: 'Add refunds',
      author: 'octocat',
      branch: 'feature/x',
      base: 'main',
      head_sha: 'abc123',
      additions: 10,
      deletions: 2,
      files_count: 3,
      status: 'open',
    });
  });

  it('PullDetailWire ⊆ PrDetail', () => {
    assertPinned('PullDetailWire/PrDetail', PullDetailWire, PrDetail, {
      id: 'p1',
      number: 482,
      title: 'Add refunds',
      author: 'octocat',
      branch: 'feature/x',
      base: 'main',
      head_sha: 'abc123',
      additions: 10,
      deletions: 2,
      files_count: 3,
      status: 'open',
      files: [],
      commits: [],
    });
  });

  it('ReviewRunTargetWire ⊆ ReviewRunTarget', () => {
    assertPinned('ReviewRunTargetWire/ReviewRunTarget', ReviewRunTargetWire, ReviewRunTarget, {
      run_id: 'run1',
      agent_id: 'a1',
      agent_name: 'General Reviewer',
    });
  });

  it('ReviewRunResponseWire ⊆ ReviewRunResponse', () => {
    assertPinned('ReviewRunResponseWire/ReviewRunResponse', ReviewRunResponseWire, ReviewRunResponse, {
      pr_id: 'p1',
      runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'General Reviewer' }],
      reviews: [],
    });
  });

  it('RunSummaryWire ⊆ RunSummary', () => {
    assertPinned('RunSummaryWire/RunSummary', RunSummaryWire, RunSummary, {
      run_id: 'run1',
      agent_id: 'a1',
      agent_name: 'General Reviewer',
      provider: 'openai',
      model: 'gpt-4o',
      status: 'done',
      error: null,
      duration_ms: 4200,
      tokens_in: 100,
      tokens_out: 200,
      cost_usd: 0.01,
      findings_count: 3,
      grounding: 'g',
      ran_at: '2024-01-01T00:00:00Z',
      score: 90,
      blockers: 0,
    });
  });

  it('FindingWire ⊆ FindingRecord', () => {
    assertPinned('FindingWire/FindingRecord', FindingWire, FindingRecord, findingFixture);
  });

  it('ReviewWire ⊆ ReviewRecord', () => {
    assertPinned('ReviewWire/ReviewRecord', ReviewWire, ReviewRecord, {
      id: 'rev1',
      pr_id: 'p1',
      agent_id: 'a1',
      run_id: 'run1',
      agent_name: 'General Reviewer',
      kind: 'review',
      verdict: 'comment',
      summary: 'summary text',
      score: 80,
      model: 'gpt-4o',
      created_at: '2024-01-01T00:00:00Z',
      findings: [findingFixture],
    });
  });

  it('ConventionWire ⊆ ConventionCandidate', () => {
    assertPinned('ConventionWire/ConventionCandidate', ConventionWire, ConventionCandidate, {
      id: 'c1',
      repo_id: 'r1',
      rule: 'Use zod for input validation',
      rationale: 'consistency',
      category: 'general',
      evidence_path: 'src/x.ts',
      evidence_line: 10,
      evidence_snippet: 'const x = z.object(...)',
      confidence: 0.9,
      status: 'accepted',
      created_at: '2024-01-01T00:00:00Z',
    });
  });

  it('RunEventWire ⊆ RunEvent', () => {
    assertPinned('RunEventWire/RunEvent', RunEventWire, RunEvent, {
      runId: 'run1',
      seq: 1,
      kind: 'info',
      msg: 'hello',
      t: '00.31',
    });
  });

  it('ApiErrorBodyWire ⊆ ApiErrorBody', () => {
    assertPinned('ApiErrorBodyWire/ApiErrorBody', ApiErrorBodyWire, ApiErrorBody, {
      error: { code: 'NOT_FOUND', message: 'not found' },
    });
  });
});
