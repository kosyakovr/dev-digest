import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * The two places a capturing-logger test cannot reach: the REAL Fastify pino
 * logger. Its stdout (fd 1) writes are intercepted, so these tests read what the
 * server would actually print.
 *   - AC-4: POST /pulls/:id/intent logs `prompt: assembled` with
 *     correlationId === the request id.
 *   - AC-5: the boot line for DEVDIGEST_PROMPT_LOG=verbose (warn when ignored).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const SPEC_SENTINEL = 'SPEC-CONTENT-SENTINEL-7';
const PR_BODY_SENTINEL = 'PR-BODY-SENTINEL-5';
const HEAD = 'a1b2c3d4';

type Printed = Record<string, unknown>;

/** Collect what pino writes to fd 1 (and swallow it, so the test output stays quiet). */
function interceptStdout() {
  const printed: Printed[] = [];
  const raw: string[] = [];
  const take = (data: unknown): number => {
    const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      raw.push(line);
      try {
        printed.push(JSON.parse(line) as Printed);
      } catch {
        /* not a JSON log line */
      }
    }
    return typeof data === 'string' ? Buffer.byteLength(data) : (data as Uint8Array).byteLength;
  };
  // pino's stdout destination (sonic-boom) writes through fs.write (async) or fs.writeSync.
  const realWrite = fs.write as (...a: unknown[]) => unknown;
  const realWriteSync = fs.writeSync as (...a: unknown[]) => number;
  const writeSpy = vi.spyOn(fs, 'write').mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) => {
    if (fd !== 1) return realWrite(fd, data, ...rest);
    const n = take(data);
    const cb = rest.find((a) => typeof a === 'function') as ((e: null, n: number) => void) | undefined;
    cb?.(null, n);
    return undefined;
  }) as unknown as typeof fs.write);
  const syncSpy = vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) => {
    if (fd !== 1) return realWriteSync(fd, data, ...rest);
    return take(data);
  }) as typeof fs.writeSync);
  return {
    printed,
    raw,
    /** Poll until a printed line satisfies `pred` (the destination flushes on a later tick). */
    async until(pred: (l: Printed) => boolean, ms = 3000): Promise<void> {
      const end = Date.now() + ms;
      while (!printed.some(pred) && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    },
    restore: () => {
      writeSpy.mockRestore();
      syncSpy.mockRestore();
    },
  };
}

d('real Fastify logger: prompt logging (pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  let stdout: ReturnType<typeof interceptStdout> | undefined;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(() => stdout?.restore());

  /** NODE_ENV=production so pino writes straight to stdout (no pino-pretty transport). */
  const cfg = (extra: Record<string, string> = {}) =>
    loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'info', ...extra });

  function appWith(config: ReturnType<typeof cfg>) {
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({
          diff: `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n keep\n+const k = "${AWS_KEY}";`,
          filesAtRef: { [`${HEAD}:docs/specs/x.md`]: `${SPEC_SENTINEL} plan body` },
        }),
        github: new MockGitHubClient(),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: {
              PrIntentClassification: {
                evidence: [],
                intent: 'Add rate limiting',
                in_scope: ['api'],
                out_of_scope: [],
                sources_conflict: false,
              },
            },
          }),
        },
      },
    });
  }

  async function setupPr() {
    const db = pg.handle.db;
    const name = `plog-http-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: HEAD,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: `${PR_BODY_SENTINEL} See docs/specs/x.md for the plan.`,
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/a.ts',
      additions: 1,
      deletions: 0,
      patch: `@@ -1,1 +1,2 @@\n keep\n+const k = "${AWS_KEY}";`,
    });
    return pr!;
  }

  it('AC-4: POST /pulls/:id/intent logs prompt: assembled with correlationId equal to the request id', async () => {
    stdout = interceptStdout();
    const app = await appWith(cfg());
    const pr = await setupPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    await stdout.until((l) => l.msg === 'request completed');
    const lines = stdout.printed.filter((l) => l.msg === 'prompt: assembled');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'intent', trigger: 'manual' });
    expect(typeof lines[0]!.reqId).toBe('string');
    expect(lines[0]!.correlationId).toBe(lines[0]!.reqId);
    // Nothing printed for this request carries content.
    const all = stdout.raw.join('\n');
    for (const needle of [AWS_KEY, SPEC_SENTINEL, PR_BODY_SENTINEL]) expect(all, needle).not.toContain(needle);
  });

  it('AC-5: verbose in production -> one warn line at boot naming the environment', async () => {
    stdout = interceptStdout();
    await appWith(cfg({ DEVDIGEST_PROMPT_LOG: 'verbose' }));
    await stdout.until((l) => String(l.msg).startsWith('prompt logging:'));
    const boot = stdout.printed.filter((l) => String(l.msg).startsWith('prompt logging:'));
    expect(boot).toHaveLength(1);
    expect(boot[0]!.level).toBe(40); // pino warn
    expect(String(boot[0]!.msg)).toContain('ignored');
    expect(String(boot[0]!.msg)).toContain('NODE_ENV=production');
  });

  it('no boot line when verbose was not requested', async () => {
    stdout = interceptStdout();
    await appWith(cfg());
    await new Promise((r) => setTimeout(r, 300)); // give a stray boot line time to flush
    expect(stdout.printed.filter((l) => String(l.msg).startsWith('prompt logging:'))).toEqual([]);
  });

  // ---- AC-5 / AM1 boot lines: the info branch and the "not set explicitly" warn branch ----
  const bootLines = (s: ReturnType<typeof interceptStdout>) =>
    s.printed.filter((l) => String(l.msg).startsWith('prompt logging:'));

  it('AC-5: NODE_ENV=test + verbose -> exactly one info line "prompt logging: verbose (local only)"', async () => {
    stdout = interceptStdout();
    await appWith(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DEVDIGEST_PROMPT_LOG: 'verbose' }));
    await stdout.until((l) => String(l.msg).startsWith('prompt logging:'));
    await new Promise((r) => setTimeout(r, 200));
    const boot = bootLines(stdout);
    expect(boot).toHaveLength(1);
    expect(boot[0]!.level).toBe(30); // pino info
    expect(boot[0]!.msg).toBe('prompt logging: verbose (local only)');
  });

  it('AC-5: NODE_ENV=development + verbose -> exactly one info line (pino-pretty worker sidestepped, branch still real)', async () => {
    stdout = interceptStdout();
    // The loaded config says development + verbose. Only `nodeEnv` is switched to production for
    // buildApp so it does not start the pino-pretty worker thread, whose output cannot be read here;
    // the boot branch reads promptLog / promptLogRequested, which stay as loaded.
    const loaded = loadConfig({ NODE_ENV: 'development', LOG_LEVEL: 'info', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(loaded.promptLog).toBe('verbose');
    await appWith({ ...loaded, nodeEnv: 'production' });
    await stdout.until((l) => String(l.msg).startsWith('prompt logging:'));
    await new Promise((r) => setTimeout(r, 200));
    const boot = bootLines(stdout);
    expect(boot).toHaveLength(1);
    expect(boot[0]!.level).toBe(30);
    expect(boot[0]!.msg).toBe('prompt logging: verbose (local only)');
  });

  it('AM1: NODE_ENV unset + verbose -> exactly one warn line naming "NODE_ENV not set explicitly"', async () => {
    stdout = interceptStdout();
    const loaded = loadConfig({ LOG_LEVEL: 'info', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(loaded.promptLogIgnoredReason).toBe('NODE_ENV not set explicitly');
    await appWith({ ...loaded, nodeEnv: 'production' }); // same pino-pretty sidestep as above
    await stdout.until((l) => String(l.msg).startsWith('prompt logging:'));
    await new Promise((r) => setTimeout(r, 200));
    const boot = bootLines(stdout);
    expect(boot).toHaveLength(1);
    expect(boot[0]!.level).toBe(40); // pino warn
    expect(String(boot[0]!.msg)).toContain('NODE_ENV not set explicitly');
  });

  // ---- pino redact paths (backup layer) on the REAL app logger ----
  const REDACT_KEYS = ['apiKey', 'token', 'authorization', 'diff', 'body', 'content', 'text', 'systemPrompt', 'prDescription'];
  const SECRET = 'REDACT-ME-1234567890';

  async function logged(emit: (log: { info: (o: unknown, m?: string) => void }) => void, marker: string) {
    stdout = interceptStdout();
    const app = await appWith(cfg());
    emit(app.log);
    await stdout.until((l) => l.msg === marker);
    return stdout.printed.find((l) => l.msg === marker)!;
  }

  it('redact: every listed key is censored to [redacted] one level down (log.info({ x: { <key>: … } }))', async () => {
    const line = await logged(
      (log) => log.info({ x: Object.fromEntries(REDACT_KEYS.map((k) => [k, SECRET])) }, 'redact-nested'),
      'redact-nested',
    );
    const x = line.x as Record<string, unknown>;
    const notCensored = REDACT_KEYS.filter((k) => x[k] !== '[redacted]');
    expect(notCensored).toEqual([]);
    expect(JSON.stringify(line)).not.toContain(SECRET);
  });

  it('redact: every listed key is censored at the TOP level of the log object (log.info({ <key>: … }))', async () => {
    const line = await logged(
      (log) => log.info(Object.fromEntries(REDACT_KEYS.map((k) => [k, SECRET])), 'redact-top'),
      'redact-top',
    );
    const notCensored = REDACT_KEYS.filter((k) => line[k] !== '[redacted]');
    expect(notCensored).toEqual([]);
    expect(JSON.stringify(line)).not.toContain(SECRET);
  });

  // Outcome, not shape: Fastify's own `req` serializer reduces `req` to {} before redaction, so the
  // header value must never appear in the printed line, whichever layer stops it.
  it('redact: an authorization / cookie header value never reaches the printed log line', async () => {
    const line = await logged(
      (log) =>
        log.info({ req: { headers: { authorization: `Bearer ${SECRET}`, cookie: `sid=${SECRET}`, accept: 'x' } } }, 'redact-req'),
      'redact-req',
    );
    expect(JSON.stringify(line)).not.toContain(SECRET);
  });

  it('redact: a real request carrying Authorization and Cookie headers prints neither value', async () => {
    stdout = interceptStdout();
    const app = await appWith(cfg());
    await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/intent',
      headers: { authorization: `Bearer ${SECRET}`, cookie: `sid=${SECRET}` },
    });
    await stdout.until((l) => l.msg === 'request completed');
    expect(stdout.printed.some((l) => l.msg === 'request completed')).toBe(true);
    expect(stdout.raw.join('\n')).not.toContain(SECRET);
  });
});
