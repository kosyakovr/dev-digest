/**
 * Ring ①: the `DevDigestApi` port, named after the conversation (what we ask
 * DevDigest), not the transport. Implemented in `src/adapters/http/`. Read-only
 * except `startReview`; there is deliberately NO cancel or delete method.
 * Imports `./schemas.ts` types only: no HTTP, no MCP SDK, no env here.
 */
import type {
  ActiveRun,
  Agent,
  Convention,
  Pull,
  Repo,
  Review,
  RunEvent,
  RunSummary,
  StartReviewResult,
} from './schemas.ts';

export interface CallOpts {
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface DevDigestApi {
  listRepos(opts: CallOpts): Promise<Repo[]>;
  listPulls(repoId: string, opts: CallOpts): Promise<Pull[]>;
  listAgents(opts: CallOpts): Promise<Agent[]>;
  activeRuns(prId: string, opts: CallOpts): Promise<ActiveRun[]>;
  startReview(prId: string, agentId: string, opts: CallOpts): Promise<StartReviewResult>;
  /** Live events of a run; ends when the run is done. `timeoutMs` bounds the connect only. */
  runEvents(runId: string, opts: CallOpts): AsyncIterable<RunEvent>;
  listRuns(prId: string, opts: CallOpts): Promise<RunSummary[]>;
  listReviews(prId: string, opts: CallOpts): Promise<Review[]>;
  listConventions(repoId: string, opts: CallOpts): Promise<Convention[]>;
}
