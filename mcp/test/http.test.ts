/**
 * WP5.tests — `HttpDevDigestApi` (Contract § Architecture ring ③), driven
 * with a fake `fetchImpl` (Contract § Doubles).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDevDigestApi, type FetchImpl } from '../src/api/http.js';
import { DevDigestError, NotFoundError, StaleIdError, StaleRepoIdError } from '../src/errors.js';
import { PR_ID, REPO_ID } from './helpers/fixtures.js';

function connectionRefusedFetch(): FetchImpl {
  return (async () => {
    const err = new TypeError('fetch failed');
    (err as unknown as { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
    throw err;
  }) as FetchImpl;
}

function neverAnsweringFetch(): FetchImpl {
  return ((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  }) as FetchImpl;
}

function jsonResponse(body: unknown, status: number): FetchImpl {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as FetchImpl;
}

/** Resolves with a 200 whose `.text()` never settles on its own — it rejects
 * with an AbortError once the `signal` fetchImpl was called with aborts,
 * mimicking a body read that is still in flight when a timeout or a caller
 * cancellation fires (generic-1-4). */
function slowBodyFetch(): FetchImpl {
  return ((_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    const res = {
      status: 200,
      ok: true,
      text: () =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    } as unknown as Response;
    return Promise.resolve(res);
  }) as FetchImpl;
}

describe('HttpDevDigestApi', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps a connection-refused fetch rejection to E1', async () => {
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: connectionRefusedFetch() });
    await expect(api.listAgents()).rejects.toThrow(
      'DevDigest API is not reachable at http://localhost:3001 (ECONNREFUSED). Start it (cd server && pnpm dev) or set DEVDIGEST_API_BASE, then retry.',
    );
  });

  it('maps HTTP 429 to E3', async () => {
    const fetchImpl = (async () => new Response(null, { status: 429 })) as FetchImpl;
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(api.listAgents()).rejects.toThrow(
      'DevDigest rate limit hit on GET /agents. Wait about a minute before retrying (reviews: 10 per minute).',
    );
  });

  it('maps HTTP 500 with a JSON error body to E4, including the server message', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: 'boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })) as FetchImpl;
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(api.listAgents()).rejects.toThrow(/returned 500 for GET \/agents: boom/);
  });

  it('maps a 200 with a non-JSON body to E5', async () => {
    const fetchImpl = (async () => new Response('<html>', { status: 200 })) as FetchImpl;
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(api.listAgents()).rejects.toThrow(/^Unexpected response from GET \/agents/);
  });

  it('maps HTTP 404 on getPull to a NotFoundError, which is a DevDigestError', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })) as FetchImpl;
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(api.getPull(PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(api.getPull(PR_ID)).rejects.toBeInstanceOf(DevDigestError);
  });

  it('maps a fetch that never answers, aborted at its own 30 s timeout, to E2', async () => {
    vi.useFakeTimers();
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: neverAnsweringFetch() });
    const promise = api.listAgents();
    const assertion = expect(promise).rejects.toThrow(/did not answer GET \/agents within 30 s/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('appends the "may have started" suffix to E2 for a POST /pulls/:id/review that never answers', async () => {
    vi.useFakeTimers();
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: neverAnsweringFetch() });
    const promise = api.startReview(PR_ID, 'agent-1', { timeoutMs: 8000 });
    const assertion = expect(promise).rejects.toThrow(/within 8 s/);
    const assertion2 = expect(promise).rejects.toThrow(/may have started/);
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    await assertion2;
  });

  // generic-1-4 — an own-timeout firing while the body is still being read
  // must still map to E2, and a caller abort at the same point must still
  // rethrow raw (never surfaced as a raw AbortError either way — spec §
  // Error texts § 404 mapping's sibling rule for E2).
  describe('a timeout or cancellation during body read (generic-1-4)', () => {
    it('maps an own-timeout that fires while res.text() is still pending to E2', async () => {
      vi.useFakeTimers();
      const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: slowBodyFetch() });
      const promise = api.listAgents();
      const assertion = expect(promise).rejects.toThrow(/did not answer GET \/agents within 30 s/);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    });

    it('rethrows a caller abort raw while res.text() is still pending (never mapped to E2)', async () => {
      const controller = new AbortController();
      const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: slowBodyFetch() });
      const promise = api.listAgents({ signal: controller.signal });
      // Let fetchImpl resolve and reach res.text() before aborting.
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();
      const err = await promise.catch((e: unknown) => e);
      expect((err as { name?: string }).name).toBe('AbortError');
      expect((err as Error).message).not.toMatch(/did not answer/);
    });
  });

  // generic-1-1 — 404 mapping per spec § Error texts § 404 mapping: getPull
  // (GET /pulls/:id exact) is the only NotFoundError; every other
  // /pulls/:id/* 404 is a StaleIdError (E10 text); every /repos/:id/* 404 is
  // a StaleRepoIdError; every other 404 is a plain E4. No 404 ever reaches a
  // caller as the raw "Not found: …" text NotFoundError carries.
  describe('404 mapping (generic-1-1)', () => {
    it('maps startReview 404 (POST /pulls/:id/review) to a StaleIdError with the E10 text', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'gone' } }, 404),
      });
      const err = await api.startReview(PR_ID, 'agent-1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StaleIdError);
      expect((err as Error).message).toBe(`No DevDigest PR with id ${PR_ID}. Use owner/repo#123 instead.`);
    });

    it('maps listRuns 404 (GET /pulls/:id/runs) to a StaleIdError with the E10 text', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'gone' } }, 404),
      });
      const err = await api.listRuns(PR_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StaleIdError);
      expect((err as Error).message).toBe(`No DevDigest PR with id ${PR_ID}. Use owner/repo#123 instead.`);
    });

    it('maps listReviews 404 (GET /pulls/:id/reviews) to a StaleIdError with the E10 text', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'gone' } }, 404),
      });
      const err = await api.listReviews(PR_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StaleIdError);
      expect((err as Error).message).toBe(`No DevDigest PR with id ${PR_ID}. Use owner/repo#123 instead.`);
    });

    it('maps listPulls 404 (GET /repos/:id/pulls) to a StaleRepoIdError with the id-only text', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'gone' } }, 404),
      });
      const err = await api.listPulls(REPO_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StaleRepoIdError);
      expect((err as Error).message).toBe(`No DevDigest repo with id ${REPO_ID}. Use owner/repo instead.`);
    });

    it('maps listConventions 404 (GET /repos/:id/conventions) to a StaleRepoIdError with the id-only text', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'gone' } }, 404),
      });
      const err = await api.listConventions(REPO_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StaleRepoIdError);
      expect((err as Error).message).toBe(`No DevDigest repo with id ${REPO_ID}. Use owner/repo instead.`);
    });

    it('maps a 404 on a route that is neither /pulls/:id/* nor /repos/:id/* to a plain E4', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'nope' } }, 404),
      });
      await expect(api.listRepos()).rejects.toThrow(
        'DevDigest API returned 404 for GET /repos: nope. Retry, or check the server log.',
      );
    });

    it('never exposes the raw "Not found: …" text NotFoundError carries, for any 404 other than getPull', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ error: { message: 'gone' } }, 404),
      });
      const errors: Error[] = await Promise.all([
        (api.startReview(PR_ID, 'agent-1') as Promise<never>).catch((e: unknown) => e as Error),
        (api.listRuns(PR_ID) as Promise<never>).catch((e: unknown) => e as Error),
        (api.listReviews(PR_ID) as Promise<never>).catch((e: unknown) => e as Error),
        (api.listPulls(REPO_ID) as Promise<never>).catch((e: unknown) => e as Error),
        (api.listConventions(REPO_ID) as Promise<never>).catch((e: unknown) => e as Error),
        (api.listRepos() as Promise<never>).catch((e: unknown) => e as Error),
      ]);
      for (const err of errors) {
        expect(err.message).not.toMatch(/^Not found:/);
      }
    });
  });

  // backend-architecture-2 — the adapter, not a use case, owns the "exactly
  // one run target" shape check for POST /pulls/:id/review, naming the route
  // in the E5 text (Handoff to test-writer's de-facto values).
  describe('startReview response-shape check (backend-architecture-2)', () => {
    it('throws E5 naming POST /pulls/:id/review when the server returns 0 run targets', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse({ pr_id: PR_ID, runs: [] }, 200),
      });
      await expect(api.startReview(PR_ID, 'agent-1')).rejects.toThrow(
        `Unexpected response from POST /pulls/${PR_ID}/review: runs expected exactly 1 run target, got 0. The DevDigest server and mcp/ may be out of sync — pull, then run npm run build in mcp/.`,
      );
    });

    it('throws E5 naming POST /pulls/:id/review when the server returns 2 run targets', async () => {
      const api = new HttpDevDigestApi({
        baseUrl: 'http://localhost:3001',
        fetchImpl: jsonResponse(
          {
            pr_id: PR_ID,
            runs: [
              { run_id: 'r1', agent_id: 'a1', agent_name: 'A' },
              { run_id: 'r2', agent_id: 'a2', agent_name: 'B' },
            ],
          },
          200,
        ),
      });
      await expect(api.startReview(PR_ID, 'agent-1')).rejects.toThrow(
        `Unexpected response from POST /pulls/${PR_ID}/review: runs expected exactly 1 run target, got 2. The DevDigest server and mcp/ may be out of sync — pull, then run npm run build in mcp/.`,
      );
    });
  });
});
