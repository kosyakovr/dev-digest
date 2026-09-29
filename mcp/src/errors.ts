/**
 * Contracts (ring ①) — the DevDigest-specific error type and the pure builders
 * for every E-text in the spec (`mcp/specs/L04-mcp-server.md` § Error texts).
 * Imports nothing (a builder is a pure string function); other rings import
 * these to throw or recognise a DevDigestError.
 */

export class DevDigestError extends Error {}

/** A 404 from a PR-id endpoint (`GET /pulls/:id`). Ring ① so the resolver (②)
 * can recognise it with `instanceof` without importing `api/` (ring ③). */
export class NotFoundError extends DevDigestError {
  constructor(
    public readonly path: string,
    public readonly serverMessage: string,
  ) {
    super(`Not found: ${path}: ${serverMessage}`);
  }
}

function prIdNotFoundText(id: string): string {
  return `No DevDigest PR with id ${id}. Use owner/repo#123 instead.`;
}

/** A 404 on a `/pulls/:id/*` endpoint other than `getPull` (`startReview`,
 * `listRuns`, `listReviews`) — the cached id the resolver handed out no
 * longer exists (the PR, or — for `startReview` — the agent). Carries the
 * same E10 text as `prIdNotFound`, but its own class (ring ①) so a use case
 * can `instanceof` it and react with a cache-invalidate-and-retry
 * (`resolve.ts`) without importing ring ③. */
export class StaleIdError extends DevDigestError {
  constructor(
    public readonly id: string,
    public readonly path: string,
  ) {
    super(prIdNotFoundText(id));
  }
}

function repoIdNotFoundText(id: string): string {
  return `No DevDigest repo with id ${id}. Use owner/repo instead.`;
}

/** A 404 on a `/repos/:id/*` endpoint (`listPulls`, `listConventions`) — the
 * cached repo id no longer exists (e.g. the repo was deleted and re-added in
 * the web app). Same class family as `StaleIdError` (ring ①, so a use case
 * can `instanceof` it and react with a cache-invalidate-and-retry,
 * `resolve.ts`), but its own id-only text — the adapter has no `listRepos()`
 * result on hand to name the known repos the way E8 does (spec §
 * 404 mapping). */
export class StaleRepoIdError extends DevDigestError {
  constructor(
    public readonly id: string,
    public readonly path: string,
  ) {
    super(repoIdNotFoundText(id));
  }
}

function list(items: string[], max: number): string {
  if (items.length === 0) return 'none';
  return items.slice(0, max).join(', ');
}

// E1 — fetch rejects (connection refused etc.)
export function unreachable(base: string, causeCode: string): DevDigestError {
  return new DevDigestError(
    `DevDigest API is not reachable at ${base} (${causeCode}). Start it (cd server && pnpm dev) or set DEVDIGEST_API_BASE, then retry.`,
  );
}

// E2 — a request exceeds its timeout
export function timeout(
  method: string,
  path: string,
  seconds: number,
  opts: { pr?: string; isReviewPost?: boolean } = {},
): DevDigestError {
  let msg = `DevDigest API did not answer ${method} ${path} within ${seconds} s. Check the server log, then retry.`;
  if (opts.isReviewPost) {
    msg += ` The review may have started: call devdigest_get_findings with pr=${opts.pr ?? '(the PR you posted to)'} before retrying.`;
  }
  return new DevDigestError(msg);
}

// E3 — HTTP 429
export function rateLimited(method: string, path: string): DevDigestError {
  return new DevDigestError(
    `DevDigest rate limit hit on ${method} ${path}. Wait about a minute before retrying (reviews: 10 per minute).`,
  );
}

// E4 — other non-2xx not mapped below
export function httpError(
  method: string,
  path: string,
  status: number,
  message: string | undefined,
): DevDigestError {
  return new DevDigestError(
    `DevDigest API returned ${status} for ${method} ${path}: ${message ?? 'no message'}. Retry, or check the server log.`,
  );
}

// E5 — invalid JSON, or a local schema `safeParse` fails
export function unexpectedResponse(
  method: string,
  path: string,
  issuePath: string,
  issueMessage: string,
): DevDigestError {
  return new DevDigestError(
    `Unexpected response from ${method} ${path}: ${issuePath} ${issueMessage}. The DevDigest server and mcp/ may be out of sync — pull, then run npm run build in mcp/.`,
  );
}

// E6 — `pr` matches no accepted form
export function unreadablePr(input: string): DevDigestError {
  return new DevDigestError(
    `Cannot read PR reference "${input}". Use owner/repo#123, https://github.com/owner/repo/pull/123, or a DevDigest PR id.`,
  );
}

// E7 — `repo` matches no accepted form
export function unreadableRepo(input: string): DevDigestError {
  return new DevDigestError(
    `Cannot read repository reference "${input}". Use owner/repo or a DevDigest repo id.`,
  );
}

// E8 — repo not in `GET /repos`
export function repoNotFound(input: string, knownRepos: string[]): DevDigestError {
  return new DevDigestError(
    `Repository ${input} is not in DevDigest. Add it in the DevDigest web app first. Known repos: ${list(knownRepos, 10)}.`,
  );
}

// E9 — PR number not in `GET /repos/:id/pulls`
export function prNotSynced(prLabel: string, repoFullName: string): DevDigestError {
  return new DevDigestError(
    `PR ${prLabel} is not among the PRs DevDigest has synced for ${repoFullName} (it syncs the 50 most recently updated). Open the repo in the DevDigest web app to sync, or pass the DevDigest PR id.`,
  );
}

// E10 — 404 on a PR-id endpoint
export function prIdNotFound(id: string): DevDigestError {
  return new DevDigestError(prIdNotFoundText(id));
}

// E11 — agent name: 0 matches
export function agentNameNotFound(input: string, names: string[]): DevDigestError {
  return new DevDigestError(
    `No agent named "${input}". Available: ${list(names, 20)}. Call devdigest_list_agents for ids.`,
  );
}

// E12 — agent UUID not in the list
export function agentIdNotFound(id: string): DevDigestError {
  return new DevDigestError(`No agent with id ${id}. Call devdigest_list_agents.`);
}

// E13 — agent name: more than 1 match
export function agentNameAmbiguous(
  input: string,
  matches: { name: string; id: string }[],
): DevDigestError {
  const rendered = matches.map((m) => `${m.name} (${m.id})`).join(', ');
  return new DevDigestError(
    `Agent name "${input}" matches ${matches.length} agents: ${rendered}. Pass the id instead.`,
  );
}

// E14 — run status `failed` / `cancelled`
export function runFailed(
  runId: string,
  agentName: string,
  pr: string,
  status: string,
  error: string | null,
): DevDigestError {
  return new DevDigestError(
    `Review run ${runId} (${agentName}) on ${pr} ${status}: server-reported error ${JSON.stringify(error ?? 'no error text')}. Fix the cause (e.g. the provider key in DevDigest Settings) and call devdigest_run_review again.`,
  );
}

// E15 — `run_id` not in `GET /pulls/:id/runs`
export function runNotOnPr(runId: string, pr: string): DevDigestError {
  return new DevDigestError(
    `Run ${runId} does not belong to ${pr}. Call devdigest_get_findings without run_id to see the latest reviews.`,
  );
}

// E16 — run `done` but no review with that `run_id`
export function reviewNotReady(runId: string, prId: string): DevDigestError {
  return new DevDigestError(
    `Run ${runId} finished but its review is not in GET /pulls/${prId}/reviews yet. Call devdigest_get_findings with run_id=${runId}.`,
  );
}

// E17 — `run_id` given and `agent` resolves to a different agent
export function runAgentMismatch(runId: string, actualAgentName: string, agentInput: string): DevDigestError {
  return new DevDigestError(
    `Run ${runId} was made by ${actualAgentName}, not ${agentInput}. Drop agent or run_id.`,
  );
}

// E18 — cursor fails to decode
export function invalidCursor(cursor: string): DevDigestError {
  return new DevDigestError(`Invalid cursor "${cursor}". Omit cursor to start from the first page.`);
}

// E19 — resolution ends with < CONFIRM_TIMEOUT_MS left before the deadline
export function resolutionBudgetExceeded(prInput: string, seconds: number): DevDigestError {
  return new DevDigestError(
    `Resolving ${prInput} took longer than the ${seconds} s budget allows (GitHub sync). No review was started; retry.`,
  );
}

// E20 — blast-radius stub
export function blastRadiusNotImplemented(): DevDigestError {
  return new DevDigestError(
    `devdigest_get_blast_radius is not implemented yet. For review results on this PR use devdigest_get_findings.`,
  );
}

// E21 — any other throw
export function unexpectedToolError(tool: string, message: string): DevDigestError {
  return new DevDigestError(
    `Unexpected error in ${tool}: ${message}. Retry; if it persists check the mcp stderr log.`,
  );
}
