/**
 * Adapter (ring ③) — `HttpDevDigestApi`, the only production implementation
 * of `DevDigestApi`. May import ①, `log.ts`, `fetch` and `TextDecoder`; must
 * not import ②/④ or the SDK (onion-architecture §4, by analogy).
 */
import type { z } from 'zod';
import {
  AgentWireList,
  RepoWireList,
  PullListItemWireList,
  PullDetailWire,
  ReviewRunResponseWire,
  RunSummaryWireList,
  ReviewWireList,
  ConventionWireList,
  ApiErrorBodyWire,
  type AgentWire,
  type RepoWire,
  type PullListItemWire,
  type ConventionWire,
  type ReviewWire,
  type RunEventWire,
  type RunSummaryWire,
  type ReviewRunTargetWire,
} from '../contracts.js';
import {
  httpError,
  rateLimited,
  timeout,
  unexpectedResponse,
  unreachable,
  NotFoundError,
  StaleIdError,
  StaleRepoIdError,
  type DevDigestError,
} from '../errors.js';
import type { CallOpts, DevDigestApi, StreamEnd } from '../ports.js';
import { REQUEST_TIMEOUT_MS } from '../constants.js';
import { readRunEvents } from './sse.js';

export type FetchImpl = typeof fetch;

export interface HttpDevDigestApiOptions {
  baseUrl: string;
  fetchImpl?: FetchImpl;
  requestTimeoutMs?: number;
}

/** The DevDigest PR id embedded in `POST /pulls/:id/review`, for the one
 * endpoint whose timeout text gets the "may have started" suffix. `http.ts`
 * only ever sees the id, not the human `owner/repo#N` label the resolver
 * already produced — a de-facto choice (Handoff to test-writer). */
function reviewPostPrId(method: string, path: string): string | undefined {
  if (method !== 'POST') return undefined;
  return path.match(/^\/pulls\/([^/]+)\/review$/)?.[1];
}

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.clone().json();
    const parsed = ApiErrorBodyWire.safeParse(body);
    return parsed.success ? parsed.data.error.message : undefined;
  } catch {
    return undefined;
  }
}

/** Matches every `/pulls/:id` and `/pulls/:id/...` path this adapter calls;
 * group 1 is the id, group 2 the rest (undefined for the bare `getPull` path). */
const PULLS_ID_PATH_RE = /^\/pulls\/([^/]+)(\/.*)?$/;

/** Matches every `/repos/:id/...` path this adapter calls (`listPulls`,
 * `listConventions`) — there is no bare `GET /repos/:id` here, so this
 * adapter never calls it without a further segment. */
const REPOS_ID_PATH_RE = /^\/repos\/([^/]+)\/.*$/;

/** 404 mapping (spec § Error texts): `getPull` (`GET /pulls/:id` exactly) is
 * the only endpoint whose 404 is a `NotFoundError`, which the resolver
 * translates to E10. A 404 on any other `/pulls/:id/*` endpoint means the id
 * the resolver handed out (the PR, or — for `startReview` — the agent) no
 * longer exists: it becomes a `StaleIdError` carrying the same E10 text, so a
 * use case can react (`resolve.ts`). A 404 on `/repos/:id/*` (`listPulls`,
 * `listConventions`) is the same family — `StaleRepoIdError` — for a cached
 * repo id that no longer exists. Every other 404 is a plain E4. */
async function mapNotFound(method: string, path: string, res: Response): Promise<DevDigestError> {
  const msg = await readErrorMessage(res);
  const pullsMatch = path.match(PULLS_ID_PATH_RE);
  if (pullsMatch) {
    const id = pullsMatch[1] as string;
    const rest = pullsMatch[2];
    if (method === 'GET' && !rest) return new NotFoundError(path, msg ?? 'not found');
    return new StaleIdError(id, path);
  }
  const reposMatch = path.match(REPOS_ID_PATH_RE);
  if (reposMatch) return new StaleRepoIdError(reposMatch[1] as string, path);
  return httpError(method, path, res.status, msg);
}

export class HttpDevDigestApi implements DevDigestApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly requestTimeoutMs: number;

  constructor({ baseUrl, fetchImpl = fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS }: HttpDevDigestApiOptions) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    opts?: CallOpts,
    body?: unknown,
  ): Promise<T> {
    const timeoutMs = opts?.timeoutMs ?? this.requestTimeoutMs;
    const ownController = new AbortController();
    const timer = setTimeout(() => ownController.abort(), timeoutMs);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, ownController.signal]) : ownController.signal;

    const ownTimeout = (): DevDigestError => {
      const prId = reviewPostPrId(method, path);
      return timeout(method, path, Math.round(timeoutMs / 1000), {
        isReviewPost: prId !== undefined,
        pr: prId,
      });
    };

    try {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          signal,
          headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        if (ownController.signal.aborted) throw ownTimeout();
        if (opts?.signal?.aborted) {
          throw err; // caller abort — rethrow so wrap() can map it to "Cancelled."
        }
        const cause = (err as { cause?: { code?: string } })?.cause;
        const code = cause?.code ?? (err as Error).message;
        throw unreachable(this.baseUrl, code);
      }

      if (res.status === 429) throw rateLimited(method, path);
      if (res.status === 404) throw await mapNotFound(method, path, res);
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        throw httpError(method, path, res.status, msg);
      }

      let text: string;
      try {
        text = await res.text();
      } catch (err) {
        // An own-timeout can fire while the body is still being read; a
        // caller abort at the same point still rethrows so wrap() maps it to
        // "Cancelled." — never surfaced as a raw AbortError either way.
        if (ownController.signal.aborted) throw ownTimeout();
        throw err;
      }
      let json: unknown;
      try {
        json = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        throw unexpectedResponse(method, path, '(body)', 'is not valid JSON');
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw unexpectedResponse(
          method,
          path,
          issue ? issue.path.join('.') || '(root)' : '(root)',
          issue?.message ?? 'failed validation',
        );
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }

  private get<T>(path: string, schema: z.ZodType<T>, opts?: CallOpts): Promise<T> {
    return this.request('GET', path, schema, opts);
  }

  private post<T>(path: string, body: unknown, schema: z.ZodType<T>, opts?: CallOpts): Promise<T> {
    return this.request('POST', path, schema, opts, body);
  }

  /** SSE GET — no own timeout; the caller's `opts.signal` (the run deadline) bounds it. */
  private async openStream(path: string, opts?: CallOpts): Promise<ReadableStream<Uint8Array>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'GET',
        signal: opts?.signal,
        headers: { accept: 'text/event-stream' },
      });
    } catch (err) {
      if (opts?.signal?.aborted) throw err;
      const cause = (err as { cause?: { code?: string } })?.cause;
      const code = cause?.code ?? (err as Error).message;
      throw unreachable(this.baseUrl, code);
    }
    if (!res.ok) {
      const msg = await readErrorMessage(res);
      throw httpError('GET', path, res.status, msg);
    }
    if (!res.body) {
      throw unexpectedResponse('GET', path, '(body)', 'response has no body');
    }
    return res.body;
  }

  listAgents(opts?: CallOpts): Promise<AgentWire[]> {
    return this.get('/agents', AgentWireList, opts);
  }

  listRepos(opts?: CallOpts): Promise<RepoWire[]> {
    return this.get('/repos', RepoWireList, opts);
  }

  listPulls(repoId: string, opts?: CallOpts): Promise<PullListItemWire[]> {
    return this.get(`/repos/${repoId}/pulls`, PullListItemWireList, opts);
  }

  getPull(prId: string, opts?: CallOpts) {
    return this.get(`/pulls/${prId}`, PullDetailWire, opts);
  }

  /** Also owns the "exactly one run target" shape check (onion-architecture
   * §5, by analogy: the adapter knows the route, so the E5 text belongs
   * here, not duplicated in a ring ② use case). */
  async startReview(prId: string, agentId: string, opts?: CallOpts): Promise<ReviewRunTargetWire> {
    const response = await this.post(`/pulls/${prId}/review`, { agentId }, ReviewRunResponseWire, opts);
    const target = response.runs[0];
    if (response.runs.length !== 1 || !target) {
      throw unexpectedResponse(
        'POST',
        `/pulls/${prId}/review`,
        'runs',
        `expected exactly 1 run target, got ${response.runs.length}`,
      );
    }
    return target;
  }

  async streamRunEvents(
    runId: string,
    onEvent: (e: RunEventWire) => void,
    opts?: CallOpts,
  ): Promise<StreamEnd> {
    const stream = await this.openStream(`/runs/${runId}/events`, opts);
    return readRunEvents(stream, onEvent, opts?.signal ?? new AbortController().signal);
  }

  listRuns(prId: string, opts?: CallOpts): Promise<RunSummaryWire[]> {
    return this.get(`/pulls/${prId}/runs`, RunSummaryWireList, opts);
  }

  listReviews(prId: string, opts?: CallOpts): Promise<ReviewWire[]> {
    return this.get(`/pulls/${prId}/reviews`, ReviewWireList, opts);
  }

  listConventions(repoId: string, opts?: CallOpts): Promise<ConventionWire[]> {
    return this.get(`/repos/${repoId}/conventions`, ConventionWireList, opts);
  }
}
