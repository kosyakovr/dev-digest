/**
 * WP5.tests — `HttpDevDigestApi` (Contract § Architecture ring ③), driven
 * with a fake `fetchImpl` (Contract § Doubles).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDevDigestApi, type FetchImpl } from '../src/api/http.js';
import { DevDigestError, NotFoundError } from '../src/errors.js';
import { PR_ID } from './helpers/fixtures.js';

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
});
