/**
 * Ring ②: turn user references (owner/repo#N, agent names) into DevDigest ids
 * using the `DevDigestApi` port. A uuid is used directly with no API call.
 * No HTTP and no status codes here.
 */
import { DevDigestError } from '../core/errors.ts';
import type { DevDigestApi } from '../core/port.ts';
import type { Agent } from '../core/schemas.ts';
import type { Calls } from './budget.ts';
import { TIMEOUT_AGENTS_MS, TIMEOUT_PULLS_MS, TIMEOUT_REPOS_MS } from './budget.ts';
import { isUuid } from './refs.ts';
import type { PrRef, RepoRef } from './refs.ts';

export interface ResolvedRepo {
  repoId: string;
  label: string;
}

export interface ResolvedPull {
  prId: string;
  label: string;
}

const KNOWN_REPOS_SHOWN = 10;

export async function resolveRepo(
  api: DevDigestApi,
  ref: RepoRef,
  calls: Calls,
): Promise<ResolvedRepo> {
  if (ref.kind === 'id') return { repoId: ref.repoId, label: ref.repoId };
  const wanted = `${ref.owner}/${ref.name}`;
  const repos = await api.listRepos(calls(TIMEOUT_REPOS_MS));
  const hit = repos.find((r) => r.full_name.toLowerCase() === wanted.toLowerCase());
  if (!hit) {
    throw new DevDigestError('repo_not_found', {
      subject: wanted,
      candidates: repos.slice(0, KNOWN_REPOS_SHOWN).map((r) => r.full_name),
    });
  }
  return { repoId: hit.id, label: hit.full_name };
}

export async function resolvePull(
  api: DevDigestApi,
  ref: PrRef,
  calls: Calls,
): Promise<ResolvedPull> {
  if (ref.kind === 'id') return { prId: ref.prId, label: ref.prId };
  const repo = await resolveRepo(api, { kind: 'name', owner: ref.owner, name: ref.name }, calls);
  const pulls = await api.listPulls(repo.repoId, calls(TIMEOUT_PULLS_MS));
  const hit = pulls.find((p) => p.number === ref.number);
  if (!hit) {
    throw new DevDigestError('pr_not_found', {
      subject: String(ref.number),
      candidates: [repo.label],
    });
  }
  return { prId: hit.id, label: `${repo.label}#${ref.number}` };
}

/** Match by id (uuid) or by case-insensitive exact name. */
export function pickAgent(agents: Agent[], input: string): Agent {
  const wanted = input.trim();
  const byId = isUuid(wanted) ? agents.filter((a) => a.id === wanted) : [];
  const hits = byId.length > 0 ? byId : agents.filter((a) => a.name.toLowerCase() === wanted.toLowerCase());
  const first = hits[0];
  if (!first) throw new DevDigestError('agent_unknown', { subject: wanted });
  if (hits.length > 1) {
    throw new DevDigestError('agent_ambiguous', { subject: wanted, candidates: hits.map((a) => a.id) });
  }
  return first;
}

export async function resolveAgent(api: DevDigestApi, input: string, calls: Calls): Promise<Agent> {
  return pickAgent(await api.listAgents(calls(TIMEOUT_AGENTS_MS)), input);
}
