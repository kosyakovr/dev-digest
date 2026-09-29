/**
 * Contracts (ring ①) — the `DevDigestApi` port. Named after the conversation
 * it holds with the DevDigest HTTP API, not after `fetch` or the SDK. Every
 * ring inward of the adapter (②, ④) depends only on this interface; only
 * `index.ts` (the composition root) ever constructs an implementation.
 */
import type {
  AgentWire,
  RepoWire,
  PullListItemWire,
  PullDetailWire,
  ReviewRunTargetWire,
  RunSummaryWire,
  ReviewWire,
  ConventionWire,
  RunEventWire,
} from './contracts.js';

export interface CallOpts {
  signal?: AbortSignal;
  /** Overrides the adapter's default per-request timeout for this call. */
  timeoutMs?: number;
}

/** How `streamRunEvents` ended: the SSE stream closed on its own, or the
 * caller's signal aborted it. There is no "timed out" value — a deadline is
 * just another abort, driven by the caller's combined signal. */
export type StreamEnd = 'closed' | 'aborted';

/** Thin client over the DevDigest HTTP API. No cancel method — the server has
 * no working cancel route for a live run (`sse.ts:79`), so this port does not
 * pretend to offer one.
 *
 * **Error contract** (spec § 404 mapping; `errors.ts`): every method may
 * reject with a plain `DevDigestError` (E1-E5 etc.) on a network failure,
 * timeout or non-404 non-2xx response. Beyond that, each method's own id
 * argument can 404, and each maps to its own error class so a use case can
 * `instanceof` it without depending on the adapter (ring ③):
 * - `getPull` → `NotFoundError` — the only method whose 404 is this class
 *   (it is the resolver's own miss case, not a stale-cache symptom).
 * - `startReview`, `listRuns`, `listReviews` → `StaleIdError` on an unknown
 *   `prId` (a PR id the resolver cached that no longer exists server-side;
 *   for `startReview` this also covers an unknown `agentId`, since the 404 is
 *   keyed by the URL's PR id either way).
 * - `listPulls`, `listConventions` → `StaleRepoIdError` on an unknown
 *   `repoId`.
 * The port double under `api/` honours this contract for any id it does not
 * know, unless a test scripted a different outcome for that call. */
export interface DevDigestApi {
  listAgents(opts?: CallOpts): Promise<AgentWire[]>;
  listRepos(opts?: CallOpts): Promise<RepoWire[]>;
  /** @throws StaleRepoIdError on an unknown `repoId`. */
  listPulls(repoId: string, opts?: CallOpts): Promise<PullListItemWire[]>;
  /** @throws NotFoundError on an unknown `prId`. */
  getPull(prId: string, opts?: CallOpts): Promise<PullDetailWire>;
  /** Returns the single run target the server started (the adapter has
   * already checked there is exactly one — onion-architecture §5, by
   * analogy).
   * @throws StaleIdError on an unknown `prId` or `agentId`. */
  startReview(prId: string, agentId: string, opts?: CallOpts): Promise<ReviewRunTargetWire>;
  streamRunEvents(
    runId: string,
    onEvent: (e: RunEventWire) => void,
    opts?: CallOpts,
  ): Promise<StreamEnd>;
  /** @throws StaleIdError on an unknown `prId`. */
  listRuns(prId: string, opts?: CallOpts): Promise<RunSummaryWire[]>;
  /** @throws StaleIdError on an unknown `prId`. */
  listReviews(prId: string, opts?: CallOpts): Promise<ReviewWire[]>;
  /** @throws StaleRepoIdError on an unknown `repoId`. */
  listConventions(repoId: string, opts?: CallOpts): Promise<ConventionWire[]>;
}
