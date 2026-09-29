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
 * pretend to offer one. */
export interface DevDigestApi {
  listAgents(opts?: CallOpts): Promise<AgentWire[]>;
  listRepos(opts?: CallOpts): Promise<RepoWire[]>;
  listPulls(repoId: string, opts?: CallOpts): Promise<PullListItemWire[]>;
  getPull(prId: string, opts?: CallOpts): Promise<PullDetailWire>;
  /** Returns the single run target the server started (the adapter has
   * already checked there is exactly one — onion-architecture §5, by
   * analogy). */
  startReview(prId: string, agentId: string, opts?: CallOpts): Promise<ReviewRunTargetWire>;
  streamRunEvents(
    runId: string,
    onEvent: (e: RunEventWire) => void,
    opts?: CallOpts,
  ): Promise<StreamEnd>;
  listRuns(prId: string, opts?: CallOpts): Promise<RunSummaryWire[]>;
  listReviews(prId: string, opts?: CallOpts): Promise<ReviewWire[]>;
  listConventions(repoId: string, opts?: CallOpts): Promise<ConventionWire[]>;
}
