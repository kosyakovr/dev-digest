/**
 * Ring ②: `get_conventions` use case. Reads only; never starts a scan.
 * No HTTP and no status codes here.
 */
import type { Clock } from '../core/clock.ts';
import type { DevDigestApi } from '../core/port.ts';
import type { ConventionsView } from '../core/views.ts';
import { callsUntil, TIMEOUT_READ_MS } from './budget.ts';
import { parseRepoRef } from './refs.ts';
import { resolveRepo } from './resolve.ts';

export interface ConventionsDeps {
  api: DevDigestApi;
  clock: Clock;
}

export interface ConventionsInput {
  repo: string;
  status: 'accepted' | 'pending' | 'rejected' | 'all';
  limit: number;
  offset: number;
}

export async function getConventions(
  deps: ConventionsDeps,
  input: ConventionsInput,
  signal?: AbortSignal,
): Promise<ConventionsView> {
  const calls = callsUntil(Number.POSITIVE_INFINITY, deps.clock, signal);
  const repo = await resolveRepo(deps.api, parseRepoRef(input.repo), calls);
  const all = await deps.api.listConventions(repo.repoId, calls(TIMEOUT_READ_MS));
  const matching = input.status === 'all' ? all : all.filter((c) => c.status === input.status);
  return {
    repoLabel: repo.label,
    status: input.status,
    items: matching.slice(input.offset, input.offset + input.limit),
    total: matching.length,
    offset: input.offset,
  };
}
