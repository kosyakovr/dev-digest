import { describe, expect, it } from 'vitest';
import { DevDigestError } from '../src/core/errors.ts';
import { renderError } from '../src/format/text.ts';
import { callsUntil } from '../src/usecases/budget.ts';
import { parsePrRef, parseRepoRef } from '../src/usecases/refs.ts';
import { pickAgent, resolveAgent, resolvePull, resolveRepo } from '../src/usecases/resolve.ts';
import {
  agent,
  AGENT_GENERAL_ID,
  AGENT_SECURITY_ID,
  FakeClock,
  PR_ID,
  pull,
  REPO_ID,
  repo,
  seededApi,
} from './fakes.ts';

const calls = () => callsUntil(Number.POSITIVE_INFINITY, new FakeClock());
const text = (e: unknown) => renderError(e, { baseUrl: 'http://x' });

async function failure(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

describe('resolveRepo', () => {
  it('lists the known repos when the repo is unknown', async () => {
    const api = seededApi();
    const err = await failure(resolveRepo(api, parseRepoRef('acme/other'), calls()));
    expect(err).toBeInstanceOf(DevDigestError);
    expect(text(err)).toContain('No repo "acme/other"');
    expect(text(err)).toContain('acme/payments-api');
  });

  it('matches full_name case-insensitively', async () => {
    const api = seededApi();
    expect(await resolveRepo(api, parseRepoRef('ACME/Payments-API'), calls())).toMatchObject({
      repoId: REPO_ID,
    });
  });

  it('uses a repo uuid directly without calling the API', async () => {
    const api = seededApi();
    await resolveRepo(api, parseRepoRef(REPO_ID), calls());
    expect(api.count('listRepos')).toBe(0);
  });

  it('shows at most 10 known repos', async () => {
    const api = seededApi();
    api.repos = Array.from({ length: 15 }, (_, i) => repo({ id: `id-${i}`, full_name: `acme/r${i}` }));
    const t = text(await failure(resolveRepo(api, parseRepoRef('acme/zzz'), calls())));
    expect(t).toContain('acme/r9');
    expect(t).not.toContain('acme/r10');
  });
});

describe('resolvePull', () => {
  it('resolves owner/repo#N through repos and pulls', async () => {
    const api = seededApi();
    const r = await resolvePull(api, parsePrRef('acme/payments-api#482'), calls());
    expect(r.prId).toBe(PR_ID);
    expect(api.of('listPulls')[0]?.args).toEqual([REPO_ID]);
  });

  it('does not call the API for a PR uuid', async () => {
    const api = seededApi();
    const r = await resolvePull(api, parsePrRef(PR_ID), calls());
    expect(r.prId).toBe(PR_ID);
    expect(api.count('listRepos')).toBe(0);
    expect(api.count('listPulls')).toBe(0);
  });

  it('says which PR number is missing in which repo', async () => {
    const api = seededApi();
    api.pulls = [pull({ number: 1 })];
    const t = text(await failure(resolvePull(api, parsePrRef('acme/payments-api#999'), calls())));
    expect(t).toContain('No PR #999 in acme/payments-api');
  });
});

describe('agent resolution', () => {
  const general = agent({ id: AGENT_GENERAL_ID, name: 'General Reviewer' });
  const security = agent({ id: AGENT_SECURITY_ID, name: 'Security Reviewer' });

  it('matches the name case-insensitively and exactly', () => {
    expect(pickAgent([general, security], 'security reviewer').id).toBe(AGENT_SECURITY_ID);
    expect(() => pickAgent([general, security], 'Security')).toThrow(DevDigestError);
  });

  it('matches a uuid against the id', () => {
    expect(pickAgent([general, security], AGENT_GENERAL_ID).name).toBe('General Reviewer');
  });

  it('lists both ids when two agents share a name', () => {
    const a = agent({ id: AGENT_GENERAL_ID, name: 'X' });
    const b = agent({ id: AGENT_SECURITY_ID, name: 'X' });
    let caught: unknown;
    try {
      pickAgent([a, b], 'x');
    } catch (e) {
      caught = e;
    }
    expect(text(caught)).toContain(AGENT_GENERAL_ID);
    expect(text(caught)).toContain(AGENT_SECURITY_ID);
  });

  it('points an unknown agent at list_agents', () => {
    let caught: unknown;
    try {
      pickAgent([general, security], 'nope');
    } catch (e) {
      caught = e;
    }
    expect(text(caught)).toContain('list_agents');
  });

  it('resolveAgent reads the agents through the port', async () => {
    const api = seededApi();
    expect((await resolveAgent(api, 'general reviewer', calls())).id).toBe(AGENT_GENERAL_ID);
    expect(api.count('listAgents')).toBe(1);
  });
});
