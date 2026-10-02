/**
 * Ring ③: the ONLY file in this package that talks to the network, and the only
 * place an HTTP status code is read. It maps transport outcomes to
 * `DevDigestError` kinds so nothing above it ever sees a status. No MCP SDK here.
 */
import { DevDigestError } from '../../core/errors.ts';
import type { ErrorResource } from '../../core/errors.ts';
import { ApiErrorBody } from '../../core/schemas.ts';
import type { Logger } from '../../log.ts';

export interface HttpOpts {
  signal?: AbortSignal | undefined;
  timeoutMs: number;
  /** Human label for error text, e.g. "look up pull requests". Never a URL. */
  operation: string;
  /** Route template for logs and errors, e.g. "GET /repos/:id/pulls". */
  route: string;
  resource?: ErrorResource | undefined;
}

export interface Http {
  json(method: 'GET' | 'POST', path: string, opts: HttpOpts, body?: unknown): Promise<unknown>;
  /** Resolves when headers arrive; `timeoutMs` bounds the connect, `signal` the whole stream. */
  stream(path: string, opts: HttpOpts): Promise<ReadableStream<Uint8Array>>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_ERROR_BODY = 4_000;

export function createHttp(
  baseUrl: string,
  logger: Logger,
  fetchImpl: FetchLike = globalThis.fetch,
): Http {
  const base = baseUrl.replace(/\/+$/, '');

  interface Attempt {
    signal: AbortSignal;
    stopTimer(): void;
    timedOut(): boolean;
  }

  function attempt(opts: HttpOpts): Attempt {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, opts.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, ctrl.signal]) : ctrl.signal;
    return { signal, stopTimer: () => clearTimeout(timer), timedOut: () => timedOut };
  }

  function timeoutError(opts: HttpOpts): DevDigestError {
    return new DevDigestError('timeout', {
      operation: opts.operation,
      route: opts.route,
      timeoutS: Math.round(opts.timeoutMs / 1000),
      ...(opts.resource ? { resource: opts.resource } : {}),
    });
  }

  /** Map a thrown transport error. A caller abort is rethrown untouched. */
  function mapThrown(err: unknown, a: Attempt, opts: HttpOpts): unknown {
    if (err instanceof DevDigestError) return err;
    if (a.timedOut()) return timeoutError(opts);
    if (opts.signal?.aborted) return err;
    return new DevDigestError('unreachable', { operation: opts.operation });
  }

  async function statusError(res: Response, opts: HttpOpts): Promise<DevDigestError> {
    let message: string | undefined;
    try {
      const text = (await res.text()).slice(0, MAX_ERROR_BODY);
      const parsed = ApiErrorBody.safeParse(JSON.parse(text));
      if (parsed.success) message = parsed.data.error.message;
    } catch {
      message = undefined;
    }
    const base = {
      operation: opts.operation,
      route: opts.route,
      ...(opts.resource ? { resource: opts.resource } : {}),
      ...(message ? { serverMessage: message } : {}),
    };
    const s = res.status;
    if (s === 404) return new DevDigestError('not_found', base);
    if (s === 429) {
      const ra = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
      return new DevDigestError('rate_limited', {
        ...base,
        ...(Number.isFinite(ra) && ra > 0 ? { retryAfterS: ra } : {}),
      });
    }
    if (s >= 500) return new DevDigestError('server', { ...base, detail: String(s) });
    return new DevDigestError('rejected', base);
  }

  async function open(
    method: string,
    path: string,
    opts: HttpOpts,
    accept: string,
    body: unknown,
  ): Promise<{ res: Response; a: Attempt; started: number }> {
    const a = attempt(opts);
    const started = Date.now();
    const headers: Record<string, string> = { accept };
    const init: RequestInit = { method, headers, signal: a.signal };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, init);
    } catch (err) {
      a.stopTimer();
      logger.debug(`${opts.route} failed ${Date.now() - started}ms`);
      throw mapThrown(err, a, opts);
    }
    logger.debug(`${opts.route} ${res.status} ${Date.now() - started}ms`);
    if (!res.ok) {
      a.stopTimer();
      throw await statusError(res, opts);
    }
    return { res, a, started };
  }

  return {
    async json(method, path, opts, body) {
      const { res, a } = await open(method, path, opts, 'application/json', body);
      try {
        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new DevDigestError('bad_response', { operation: opts.operation, route: opts.route });
        }
      } catch (err) {
        throw mapThrown(err, a, opts);
      } finally {
        a.stopTimer();
      }
    },
    async stream(path, opts) {
      const { res, a } = await open('GET', path, opts, 'text/event-stream', undefined);
      a.stopTimer();
      if (!res.body) {
        throw new DevDigestError('bad_response', { operation: opts.operation, route: opts.route });
      }
      return res.body;
    },
  };
}
