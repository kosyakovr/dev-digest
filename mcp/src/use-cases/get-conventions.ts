/**
 * Use case (ring ②) — devdigest_get_conventions. Must not import the SDK,
 * `fetch`, the environment, `api/`, `tools/`, `server.ts`, `index.ts`,
 * `config.ts` or `log.ts`.
 */
import type { DevDigestApi } from '../ports.js';
import type { Resolver } from '../resolve.js';
import { projectConvention, type ResponseFormat } from '../format.js';
import { CONVENTIONS_CAP, UNTRUSTED_NOTICE } from '../constants.js';
import type { GetConventionsOutput } from '../contracts.js';
import { StaleRepoIdError } from '../errors.js';

export interface GetConventionsInput {
  repo: string;
  status: 'accepted' | 'pending' | 'rejected' | 'all';
  response_format: ResponseFormat;
}

export interface GetConventionsDeps {
  api: DevDigestApi;
  resolver: Resolver;
}

export async function getConventions(
  deps: GetConventionsDeps,
  input: GetConventionsInput,
  signal: AbortSignal,
): Promise<GetConventionsOutput> {
  let repo = await deps.resolver.repo(input.repo, signal);
  let all;
  try {
    all = await deps.api.listConventions(repo.id, { signal });
  } catch (err) {
    if (!(err instanceof StaleRepoIdError)) throw err;
    // The cached repo id no longer exists (e.g. the repo was deleted and
    // re-added in the web app) — invalidate, re-resolve `input.repo` once,
    // and retry the read once; a second failure surfaces the proper E-text.
    deps.resolver.invalidate();
    repo = await deps.resolver.repo(input.repo, signal);
    all = await deps.api.listConventions(repo.id, { signal });
  }
  const filtered = input.status === 'all' ? all : all.filter((c) => c.status === input.status);
  const total = filtered.length;
  const truncated = total > CONVENTIONS_CAP;
  const conventions = filtered.slice(0, CONVENTIONS_CAP).map((c) => projectConvention(c, input.response_format));

  const out: GetConventionsOutput = {
    untrusted_notice: UNTRUSTED_NOTICE,
    repo: repo.fullName,
    conventions,
    total,
    truncated,
  };
  if (input.response_format === 'detailed') out.repo_id = repo.id;
  if (total === 0) {
    out.hint = `No ${input.status} conventions for ${repo.fullName}. Extract them in the DevDigest web app (repo → Conventions; costs one model call).`;
  }
  return out;
}
