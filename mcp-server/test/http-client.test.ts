/**
 * The HTTP adapter against a real `node:http` server on 127.0.0.1 (no external network).
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpDevDigestApi } from '../src/adapters/http/client.ts';
import { createHttp } from '../src/adapters/http/http.ts';
import { DevDigestError } from '../src/core/errors.ts';
import type { RunEvent } from '../src/core/schemas.ts';
import { renderError } from '../src/format/text.ts';
import { silentLogger } from '../src/log.ts';
import { AGENT_SECURITY_ID, PR_ID, RUN_ID } from './fakes.ts';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
interface Seen {
  method: string;
  url: string;
  accept: string | undefined;
  contentType: string | undefined;
  body: string;
}

const servers: Server[] = [];

async function serve(handler: Handler): Promise<{ baseUrl: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        accept: req.headers.accept,
        contentType: req.headers['content-type'],
        body,
      });
      handler(req, res, body);
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});

const api = (baseUrl: string) => new HttpDevDigestApi(createHttp(baseUrl, silentLogger));
const OPTS = { timeoutMs: 2_000 };
const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

async function failure(p: Promise<unknown>): Promise<DevDigestError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DevDigestError);
    return e as DevDigestError;
  }
  throw new Error('expected a rejection');
}

const agentRow = (id: string, name: string) => ({
  id,
  name,
  description: 'd',
  provider: 'anthropic',
  model: 'm',
  enabled: true,
  version: 1,
  system_prompt: 'x',
});

describe('HttpDevDigestApi', () => {
  it('GET /agents returns the agents and asks for JSON', async () => {
    const { baseUrl, seen } = await serve((_q, res) =>
      json(res, 200, [agentRow(AGENT_SECURITY_ID, 'Security Reviewer'), agentRow('a2', 'General Reviewer')]),
    );
    const agents = await api(baseUrl).listAgents(OPTS);
    expect(agents.map((a) => a.name)).toEqual(['Security Reviewer', 'General Reviewer']);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/agents', accept: 'application/json' });
  });

  it('keeps unknown fields (tolerant reader)', async () => {
    const { baseUrl } = await serve((_q, res) => json(res, 200, [{ ...agentRow('a1', 'X'), brand_new: 42 }]));
    const [a] = await api(baseUrl).listAgents(OPTS);
    expect((a as Record<string, unknown>).brand_new).toBe(42);
  });

  it('startReview POSTs {agentId} to /pulls/:id/review and returns the run target', async () => {
    const { baseUrl, seen } = await serve((_q, res) =>
      json(res, 200, { pr_id: PR_ID, runs: [{ run_id: RUN_ID, agent_id: AGENT_SECURITY_ID, agent_name: 'S' }], reviews: [] }),
    );
    const r = await api(baseUrl).startReview(PR_ID, AGENT_SECURITY_ID, OPTS);
    expect(r.runs[0]?.run_id).toBe(RUN_ID);
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.contentType).toContain('application/json');
    expect(seen[0]?.url).toBe(`/pulls/${PR_ID}/review`);
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({ agentId: AGENT_SECURITY_ID });
  });

  it('maps the plan routes for the read methods', async () => {
    const { baseUrl, seen } = await serve((_q, res) => json(res, 200, []));
    const a = api(baseUrl);
    await a.listRepos(OPTS);
    await a.listPulls('r1', OPTS);
    await a.activeRuns('p1', OPTS);
    await a.listRuns('p1', OPTS);
    await a.listReviews('p1', OPTS);
    await a.listConventions('r1', OPTS);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /repos',
      'GET /repos/r1/pulls',
      'GET /pulls/p1/runs/active',
      'GET /pulls/p1/runs',
      'GET /pulls/p1/reviews',
      'GET /repos/r1/conventions',
    ]);
  });

  it('has no method that could cancel or delete a run', () => {
    const names = Object.getOwnPropertyNames(HttpDevDigestApi.prototype);
    expect(names.filter((n) => /cancel|delete|remove|dismiss|extract/i.test(n))).toEqual([]);
  });

  it('maps 404 to not_found with the server message and no status field', async () => {
    const { baseUrl } = await serve((_q, res) =>
      json(res, 404, { error: { code: 'not_found', message: 'Pull request not found' } }),
    );
    const err = await failure(api(baseUrl).listRuns(PR_ID, OPTS));
    expect(err.kind).toBe('not_found');
    expect(err.serverMessage).toBe('Pull request not found');
    expect(Object.keys(err).filter((k) => /status/i.test(k))).toEqual([]);
  });

  it('maps 429 to rate_limited with Retry-After, and the rendered text says so', async () => {
    const { baseUrl } = await serve((_q, res) =>
      json(res, 429, { error: { code: 'internal_error', message: 'Rate limit exceeded' } }, { 'retry-after': '30' }),
    );
    const err = await failure(api(baseUrl).startReview(PR_ID, AGENT_SECURITY_ID, OPTS));
    expect(err.kind).toBe('rate_limited');
    expect(err.retryAfterS).toBe(30);
    const text = renderError(err, { baseUrl });
    expect(text).toContain('rate limit');
    expect(text).toContain('30');
  });

  it('maps 422 to rejected and 503 to server', async () => {
    const { baseUrl } = await serve((req, res) =>
      req.url === '/agents'
        ? json(res, 422, { error: { code: 'validation_error', message: 'bad id' } })
        : json(res, 503, { error: { code: 'internal_error', message: 'down' } }),
    );
    expect((await failure(api(baseUrl).listAgents(OPTS))).kind).toBe('rejected');
    const server = await failure(api(baseUrl).listRepos(OPTS));
    expect(server.kind).toBe('server');
    expect(renderError(server, { baseUrl })).toContain('503');
  });

  it('survives an error body that is not the error envelope', async () => {
    const { baseUrl } = await serve((_q, res) => {
      res.writeHead(502, { 'content-type': 'text/html' });
      res.end('<html>bad gateway</html>');
    });
    const err = await failure(api(baseUrl).listAgents(OPTS));
    expect(err.kind).toBe('server');
    expect(renderError(err, { baseUrl })).not.toContain('<html>');
  });

  it('maps a closed port to unreachable and names the base url', async () => {
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const baseUrl = `http://127.0.0.1:${port}`;

    const err = await failure(api(baseUrl).listAgents(OPTS));

    expect(err.kind).toBe('unreachable');
    expect(renderError(err, { baseUrl })).toContain(baseUrl);
  });

  it('times out on a handler that never responds, within 1 s of a 200 ms limit', async () => {
    const { baseUrl } = await serve(() => undefined);
    const started = performance.now();
    const err = await failure(api(baseUrl).listAgents({ timeoutMs: 200 }));
    expect(err.kind).toBe('timeout');
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('does not report a client abort as a timeout or unreachable', async () => {
    const { baseUrl } = await serve(() => undefined);
    const ctl = new AbortController();
    const p = api(baseUrl).listAgents({ timeoutMs: 5_000, signal: ctl.signal });
    setTimeout(() => ctl.abort(), 50);
    const caught = await p.catch((e: unknown) => e);
    expect(caught).not.toBeInstanceOf(DevDigestError);
    expect((caught as Error).name).toBe('AbortError');
  });

  it('maps a 200 text/plain body to bad_response', async () => {
    const { baseUrl } = await serve((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    });
    expect((await failure(api(baseUrl).listAgents(OPTS))).kind).toBe('bad_response');
  });

  it('the transport itself rejects a non-JSON 200 body as bad_response', async () => {
    const { baseUrl } = await serve((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    });
    const err = await failure(createHttp(baseUrl, silentLogger).json('GET', '/agents', {
      timeoutMs: 2_000,
      operation: 'list agents',
      route: 'GET /agents',
    }));
    expect(err.kind).toBe('bad_response');
  });

  it('maps a JSON body of the wrong shape to bad_response', async () => {
    const { baseUrl } = await serve((_q, res) => json(res, 200, { not: 'an array' }));
    expect((await failure(api(baseUrl).listAgents(OPTS))).kind).toBe('bad_response');
  });

  it('runEvents yields seq 1, 2 once each, skips an invalid frame, and completes', async () => {
    const ev = (seq: number): RunEvent => ({ runId: RUN_ID, seq, kind: 'info', msg: `m${seq}` });
    const { baseUrl, seen } = await serve((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`id: 1\nevent: info\ndata: ${JSON.stringify(ev(1))}\n\n`);
      res.write(`id: 2\nevent: info\ndata: ${JSON.stringify(ev(2))}\n\n`);
      res.write('data: nope\n\n');
      res.write(`id: 2\nevent: info\ndata: ${JSON.stringify(ev(2))}\n\n`);
      res.end();
    });
    const seqs: number[] = [];
    for await (const e of api(baseUrl).runEvents(RUN_ID, OPTS)) seqs.push(e.seq);
    expect(seqs).toEqual([1, 2]);
    expect(seen[0]).toMatchObject({ url: `/runs/${RUN_ID}/events`, accept: 'text/event-stream' });
  });

  it('runEvents closes the connection when the consumer stops reading early', async () => {
    let closed!: () => void;
    const serverSawClose = new Promise<void>((r) => (closed = r));
    const { baseUrl } = await serve((_q, res) => {
      res.on('close', closed);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ runId: RUN_ID, seq: 1, kind: 'k', msg: 'm' })}\n\n`);
      // never ends: only the client can close it
    });
    for await (const e of api(baseUrl).runEvents(RUN_ID, OPTS)) {
      expect(e.seq).toBe(1);
      break;
    }
    await Promise.race([
      serverSawClose,
      new Promise((_, rej) => setTimeout(() => rej(new Error('server never saw the connection close')), 2_000)),
    ]);
  });

  it('runEvents stops reading when the caller aborts an open stream', async () => {
    const { baseUrl } = await serve((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ runId: RUN_ID, seq: 1, kind: 'k', msg: 'm' })}\n\n`);
      // never ends
    });
    const ctl = new AbortController();
    const got: number[] = [];
    const reading = (async () => {
      for await (const e of api(baseUrl).runEvents(RUN_ID, { timeoutMs: 2_000, signal: ctl.signal })) {
        got.push(e.seq);
        ctl.abort();
      }
    })();
    const caught = await reading.catch((e: unknown) => e);
    expect(got).toEqual([1]);
    // ending by abort is either a clean end or an AbortError, never a hang
    if (caught !== undefined) expect((caught as Error).name).toBe('AbortError');
  });
});
