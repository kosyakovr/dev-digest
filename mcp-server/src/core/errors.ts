/**
 * Ring ①: the one domain error of this package. It carries a `kind` and display
 * facts, never an HTTP status code and never rendered text (rendering lives in
 * `src/format/text.ts`). No imports: no HTTP, no MCP SDK, no env here.
 */

export type DevDigestErrorKind =
  | 'unreachable'
  | 'timeout'
  | 'not_found'
  | 'rejected'
  | 'rate_limited'
  | 'server'
  | 'bad_response'
  | 'repo_not_found'
  | 'pr_not_found'
  | 'agent_unknown'
  | 'agent_ambiguous'
  | 'bad_ref'
  | 'no_review'
  | 'run_not_found';

/** What a 404/timeout was about; picks the hint text. */
export type ErrorResource = 'agent' | 'pr' | 'repo' | 'pr_lookup' | 'other';

export interface DevDigestErrorInit {
  /** Human label such as "look up pull requests". Never a URL. */
  operation?: string;
  /** METHOD + route template, e.g. "GET /repos/:id/pulls" (timeout text). */
  route?: string;
  timeoutS?: number;
  resource?: ErrorResource;
  serverMessage?: string;
  retryAfterS?: number;
  /** Display text such as the 5xx status ("502"). */
  detail?: string;
  /** The user's input that could not be resolved (repo, agent name, PR number). */
  subject?: string;
  /** Known repo names, ambiguous agent ids, or the PR label (candidates[0]) for no_review / run_not_found. */
  candidates?: string[];
}

export class DevDigestError extends Error {
  readonly kind: DevDigestErrorKind;
  readonly operation: string;
  readonly route: string | undefined;
  readonly timeoutS: number | undefined;
  readonly resource: ErrorResource;
  readonly serverMessage: string | undefined;
  readonly retryAfterS: number | undefined;
  readonly detail: string | undefined;
  readonly subject: string | undefined;
  readonly candidates: string[];

  constructor(kind: DevDigestErrorKind, init: DevDigestErrorInit = {}) {
    super(`${kind}${init.operation ? `: ${init.operation}` : ''}`);
    this.name = 'DevDigestError';
    this.kind = kind;
    this.operation = init.operation ?? '';
    this.route = init.route;
    this.timeoutS = init.timeoutS;
    this.resource = init.resource ?? 'other';
    this.serverMessage = init.serverMessage;
    this.retryAfterS = init.retryAfterS;
    this.detail = init.detail;
    this.subject = init.subject;
    this.candidates = init.candidates ?? [];
  }
}
