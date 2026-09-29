/**
 * WP6.tests — `Resolver` (Contract § Resolver), driven with `FakeDevDigestApi`
 * (Contract § Doubles: "port calls" means its `calls` log).
 */
import { describe, expect, it } from 'vitest';
import { Resolver } from '../src/resolve.js';
import { StaleRepoIdError } from '../src/errors.js';
import { GR_ID, GR_NAME, PR_ID, PR_NUMBER, PR_TITLE, REPO_FULL_NAME, REPO_ID, SR_ID, SR_NAME, makeFake } from './helpers/fixtures.js';

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

// generic-1-2 (repo) — a cached repo id going stale (repo deleted + re-added
// in the web app, same full_name, new UUIDs) recovers via invalidate +
// re-resolve + retry once inside `prByRef` (spec § Resolver § cache
// invalidation).
describe('Resolver.pr — repo-id staleness recovers via invalidate + retry (generic-1-2 repo)', () => {
  it('invalidates, re-resolves, and retries once when a cached repo id 404s, resolving under the new id', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);
    // Prime the cache under the OLD repo id (a PR list that only knows #482).
    await resolver.pr('acme/payments-api#482');

    const NEW_REPO_ID = '99999999-9999-4999-8999-999999999999';
    fake.script('listPulls', { error: new StaleRepoIdError(REPO_ID, `/repos/${REPO_ID}/pulls`) });
    fake.repos = [{ id: NEW_REPO_ID, full_name: REPO_FULL_NAME }];
    fake.pulls = { [NEW_REPO_ID]: [{ id: PR_ID, number: 999, title: 'Renumbered' }] };

    const ref = await resolver.pr('acme/payments-api#999');

    expect(ref).toMatchObject({ id: PR_ID, repoId: NEW_REPO_ID, number: 999 });
  });

  it('surfaces the id-only "No DevDigest repo with id …" text on a second consecutive StaleRepoIdError', async () => {
    const fake = makeFake();
    const resolver = new Resolver(fake);
    await resolver.pr('acme/payments-api#482');

    fake.script('listPulls', { error: new StaleRepoIdError(REPO_ID, `/repos/${REPO_ID}/pulls`) });
    fake.script('listPulls', { error: new StaleRepoIdError(REPO_ID, `/repos/${REPO_ID}/pulls`) });

    await expect(resolver.pr('acme/payments-api#999')).rejects.toThrow(
      `No DevDigest repo with id ${REPO_ID}. Use owner/repo instead.`,
    );
  });
});

// generic-1-3 — once UUID_RE matches, the input is lower-cased before
// comparing or caching (spec § Resolver), so an upper-case UUID resolves
// exactly like its lower-case form instead of missing the cache/list scan.
// Fixture ids (PR_ID, REPO_ID, GR_ID) are all-digit UUIDs, so `.toUpperCase()`
// on them is a no-op — these tests need ids that actually contain hex
// letters to exercise the lower-casing.
describe('UUID case-insensitivity (generic-1-3)', () => {
  const HEX_PR_ID = 'aabbccdd-1234-4abc-8abc-abcdefabcdef';
  const HEX_REPO_ID = 'bbccddee-1234-4abc-8abc-abcdefabcdef';
  const HEX_AGENT_ID = 'ccddeeff-1234-4abc-8abc-abcdefabcdef';

  it('resolves an upper-case PR UUID the same as its lower-case form', async () => {
    const fake = makeFake();
    fake.prs[HEX_PR_ID] = { id: HEX_PR_ID, number: PR_NUMBER, title: PR_TITLE };
    const resolver = new Resolver(fake);

    const ref = await resolver.pr(HEX_PR_ID.toUpperCase());

    expect(ref.id).toBe(HEX_PR_ID);
    expect(fake.calls.filter((c) => c.method === 'getPull')).toHaveLength(1);
  });

  it('resolves an upper-case repo UUID the same as its lower-case form', async () => {
    const fake = makeFake();
    fake.repos = [{ id: HEX_REPO_ID, full_name: REPO_FULL_NAME }];
    const resolver = new Resolver(fake);

    const ref = await resolver.repo(HEX_REPO_ID.toUpperCase());

    expect(ref).toEqual({ id: HEX_REPO_ID, fullName: REPO_FULL_NAME });
  });

  it('resolves an upper-case agent UUID the same as its lower-case form', async () => {
    const fake = makeFake();
    fake.agents = [{ id: HEX_AGENT_ID, name: GR_NAME, model: 'gpt-4o', enabled: true }];
    const resolver = new Resolver(fake);

    const ref = await resolver.agent(HEX_AGENT_ID.toUpperCase());

    expect(ref).toEqual({ id: HEX_AGENT_ID, name: GR_NAME });
  });
});
