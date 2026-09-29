/**
 * Test helper — the hermetic fixtures named in the plan's Test brief
 * (`mcp-plan-v2.md` <!-- test-brief -->): one repo, one PR, two agents.
 * Shared by every `mcp/test/**` file that needs a resolvable pr/repo/agent.
 */
import type { AgentWire, PullListItemWire, RepoWire } from '../../src/contracts.js';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';

export const REPO_ID = '11111111-1111-4111-8111-111111111111';
export const REPO_FULL_NAME = 'acme/payments-api';

export const PR_ID = '22222222-2222-4222-8222-222222222222';
export const PR_NUMBER = 482;
export const PR_TITLE = 'Add refunds';
export const PR_LABEL = `${REPO_FULL_NAME}#${PR_NUMBER}`;

export const GR_ID = '33333333-3333-4333-8333-333333333333';
export const GR_NAME = 'General Reviewer';

export const SR_ID = '55555555-5555-4555-8555-555555555555';
export const SR_NAME = 'Security Reviewer';

export const RUN_ID = '44444444-4444-4444-8444-444444444444';

export const REPO_FIXTURE: RepoWire = { id: REPO_ID, full_name: REPO_FULL_NAME };
export const PR_FIXTURE: PullListItemWire = { id: PR_ID, number: PR_NUMBER, title: PR_TITLE };
export const GR_FIXTURE: AgentWire = { id: GR_ID, name: GR_NAME, model: 'gpt-4o', enabled: true };
export const SR_FIXTURE: AgentWire = { id: SR_ID, name: SR_NAME, model: 'gpt-4o', enabled: true };

/** A FakeDevDigestApi pre-seeded with the repo, PR and both agents above —
 * the starting point most tests need before scripting their own scenario. */
export function makeFake(): FakeDevDigestApi {
  const fake = new FakeDevDigestApi();
  fake.repos = [REPO_FIXTURE];
  fake.pulls = { [REPO_ID]: [PR_FIXTURE] };
  fake.agents = [GR_FIXTURE, SR_FIXTURE];
  return fake;
}

/** Polls `predicate` on a real timer until it is true or `timeoutMs` elapses.
 * For tests that must NOT use fake timers (e.g. asserting an MCP-level abort
 * propagates before a deadline would fire). */
export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
