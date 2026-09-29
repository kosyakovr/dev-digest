/**
 * WP6.tests — `Resolver` (Contract § Resolver), driven with `FakeDevDigestApi`
 * (Contract § Doubles: "port calls" means its `calls` log).
 */
import { describe, expect, it } from 'vitest';
import { Resolver } from '../src/resolve.js';
import { GR_ID, GR_NAME, PR_ID, PR_NUMBER, PR_TITLE, REPO_FULL_NAME, SR_ID, SR_NAME, makeFake } from './helpers/fixtures.js';

describe('Resolver.pr', () => {
  it('resolves owner/repo#N, a case-insensitive variant, and a GitHub PR URL to the same PrRef, caching after the first', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);

    const byRef = await resolver.pr('acme/payments-api#482');
    expect(byRef).toMatchObject({ id: PR_ID, label: 'acme/payments-api#482', title: PR_TITLE, number: 482 });
    const callsAfterFirst = fake.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const byCase = await resolver.pr('ACME/Payments-API#482');
    expect(byCase).toMatchObject({ id: PR_ID, label: 'acme/payments-api#482', title: PR_TITLE });

    const byUrl = await resolver.pr('https://github.com/acme/payments-api/pull/482/files');
    expect(byUrl).toMatchObject({ id: PR_ID, label: 'acme/payments-api#482', title: PR_TITLE });

    expect(fake.calls.length).toBe(callsAfterFirst);
  });

  it('resolves a PR UUID never seen before via getPull, labelling it "#N" with no repo', async () => {
    const fake = makeFake();
    fake.prs[PR_ID] = { id: PR_ID, number: PR_NUMBER, title: PR_TITLE };
    const resolver = new Resolver(fake);

    const ref = await resolver.pr(PR_ID);

    expect(ref.label).toBe('#482');
    expect(ref.repoFullName).toBeNull();
    expect(fake.calls.filter((c) => c.method === 'getPull')).toHaveLength(1);
  });

  it('skips getPull for a PR UUID already resolved by owner/repo#N, keeping the full-name label', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);
    await resolver.pr('acme/payments-api#482');
    const callsBefore = fake.calls.length;

    const ref = await resolver.pr(PR_ID);

    expect(ref.label).toBe('acme/payments-api#482');
    expect(fake.calls.length).toBe(callsBefore);
  });

  it('refetches the PR list once on a miss, then throws E9', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);

    await expect(resolver.pr('acme/payments-api#999')).rejects.toThrow(
      /is not among the PRs DevDigest has synced for acme\/payments-api/,
    );
    expect(fake.calls.filter((c) => c.method === 'listPulls')).toHaveLength(2);
  });

  it('throws E6 for a pr reference matching no accepted form', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);

    await expect(resolver.pr('foo')).rejects.toThrow('Cannot read PR reference "foo". Use owner/repo#123, https://github.com/owner/repo/pull/123, or a DevDigest PR id.');
  });

  it('throws E8, listing the known repos, when the referenced repo is unknown', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);

    await expect(resolver.pr('other/repo#1')).rejects.toThrow(
      `Repository other/repo is not in DevDigest. Add it in the DevDigest web app first. Known repos: ${REPO_FULL_NAME}.`,
    );
  });
});

describe('Resolver.agent', () => {
  it('throws E13, listing every match, when an agent name matches more than one agent', async () => {
    const fake = makeFake();
    fake.agents = [
      { id: GR_ID, name: 'General Reviewer', model: 'gpt-4o', enabled: true },
      { id: SR_ID, name: 'General Reviewer', model: 'gpt-4o-mini', enabled: true },
    ];
    const resolver = new Resolver(fake);

    await expect(resolver.agent('general reviewer')).rejects.toThrow(
      `Agent name "general reviewer" matches 2 agents: General Reviewer (${GR_ID}), General Reviewer (${SR_ID}). Pass the id instead.`,
    );
  });

  it('throws E11, listing the available names, for an unknown agent name — refetching once (2 listAgents calls)', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);

    await expect(resolver.agent('Nope')).rejects.toThrow(
      `No agent named "Nope". Available: ${GR_NAME}, ${SR_NAME}. Call devdigest_list_agents for ids.`,
    );
    expect(fake.calls.filter((c) => c.method === 'listAgents')).toHaveLength(2);
  });
});

describe('Resolver', () => {
  it('never calls startReview — the port has no such method reachable from here', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);

    await resolver.pr('acme/payments-api#482');
    await resolver.repo('acme/payments-api');
    await resolver.agent('General Reviewer');

    expect(fake.calls.some((c) => c.method === 'startReview')).toBe(false);
  });
});
