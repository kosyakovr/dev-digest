/**
 * Ring ③: `HttpDevDigestApi` implements the `DevDigestApi` port over the
 * DevDigest HTTP API. Every response is `safeParse`d at this edge; a mismatch
 * is a `bad_response` error. Network access is delegated to `./http.ts`.
 */
import type { CallOpts, DevDigestApi } from '../../core/port.ts';
import { DevDigestError } from '../../core/errors.ts';
import type { ErrorResource } from '../../core/errors.ts';
import * as S from '../../core/schemas.ts';
import type { Http, HttpOpts } from './http.ts';
import { parseRunEvents } from './sse.ts';

import type { z } from 'zod';

export class HttpDevDigestApi implements DevDigestApi {
  private readonly http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  private opts(
    o: CallOpts,
    operation: string,
    route: string,
    resource?: ErrorResource,
  ): HttpOpts {
    return { signal: o.signal, timeoutMs: o.timeoutMs, operation, route, resource };
  }

  private async get<T>(
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    path: string,
    h: HttpOpts,
  ): Promise<T> {
    return this.parse(schema, await this.http.json('GET', path, h), h);
  }

  private parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, h: HttpOpts): T {
    const r = schema.safeParse(raw);
    if (!r.success) {
      throw new DevDigestError('bad_response', { operation: h.operation, route: h.route });
    }
    return r.data;
  }

  listRepos(o: CallOpts) {
    return this.get(S.Repos, '/repos', this.opts(o, 'list repositories', 'GET /repos'));
  }

  listPulls(repoId: string, o: CallOpts) {
    return this.get(
      S.Pulls,
      `/repos/${encodeURIComponent(repoId)}/pulls`,
      this.opts(o, 'look up pull requests', 'GET /repos/:id/pulls', 'pr_lookup'),
    );
  }

  listAgents(o: CallOpts) {
    return this.get(S.Agents, '/agents', this.opts(o, 'list agents', 'GET /agents'));
  }

  activeRuns(prId: string, o: CallOpts) {
    return this.get(
      S.ActiveRuns,
      `/pulls/${encodeURIComponent(prId)}/runs/active`,
      this.opts(o, 'check running reviews', 'GET /pulls/:id/runs/active', 'pr'),
    );
  }

  async startReview(prId: string, agentId: string, o: CallOpts) {
    const h = this.opts(o, 'start the review', 'POST /pulls/:id/review', 'agent');
    const raw = await this.http.json(
      'POST',
      `/pulls/${encodeURIComponent(prId)}/review`,
      h,
      { agentId },
    );
    return this.parse(S.StartReviewResult, raw, h);
  }

  async *runEvents(runId: string, o: CallOpts) {
    const h = this.opts(o, 'follow the run', 'GET /runs/:id/events');
    const stream = await this.http.stream(`/runs/${encodeURIComponent(runId)}/events`, h);
    yield* parseRunEvents(stream);
  }

  listRuns(prId: string, o: CallOpts) {
    return this.get(
      S.RunSummaries,
      `/pulls/${encodeURIComponent(prId)}/runs`,
      this.opts(o, 'list runs', 'GET /pulls/:id/runs', 'pr'),
    );
  }

  listReviews(prId: string, o: CallOpts) {
    return this.get(
      S.Reviews,
      `/pulls/${encodeURIComponent(prId)}/reviews`,
      this.opts(o, 'read reviews', 'GET /pulls/:id/reviews', 'pr'),
    );
  }

  listConventions(repoId: string, o: CallOpts) {
    return this.get(
      S.Conventions,
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      this.opts(o, 'read conventions', 'GET /repos/:id/conventions', 'repo'),
    );
  }
}
