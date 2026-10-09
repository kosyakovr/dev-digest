import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
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
  type MockGitHubOptions,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Risk Brief routes: GET / POST /pulls/:id/brief (plan docs/plans/L05-risk-brief.md,
 * Test brief WP3.tests; spec specs/L05-risk-brief.md). T1 cases first (AC-1, 2, 3,
 * 5, 6, 7, 12), then the T2 cases: tenancy, docs, failures, the guard, degraded
 * facts, limits and log lines. Gated on Docker; self-skips without it.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const OLD_HEAD = 'old1111';
const NEW_HEAD = 'new2222';
// New side of this hunk: lines 10..13 (ctx10, add11, ctx12, ctx13).
const PATCH = '@@ -10,3 +10,4 @@\n ctx10\n+add11\n ctx12\n ctx13';
const BODY_SENTINEL = 'PR-BODY-SENTINEL-5';
const TITLE_SENTINEL = 'PR-TITLE-SENTINEL-6';

const BRIEF_ANSWER = {
  risks: [
    {
      kind: 'security',
      title: 'T',
      explanation: 'E',
      severity: 'high',
      file_refs: ['src/a.ts:11-12', 'nope.ts'],
    },
  ],
  review_focus: [{ file: 'src/a.ts', line: 11, reason: 'R' }],
  summary: 'S',
};

const INTENT_ANSWER = {
  evidence: [],
  intent: 'Do X',
  in_scope: [],
  out_of_scope: [],
  sources_conflict: false,
};

type Json = Record<string, any>;
type Printed = Record<string, unknown>;

/** A model double whose structured call waits for `release()` and counts how many started. */
class GatedLLM extends MockLLMProvider {
  started = 0;
  release!: () => void;
  private gate = new Promise<void>((r) => {
    this.release = r;
  });
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    this.started++;
    await this.gate;
    return super.completeStructured(req as never) as Promise<never>;
  }
}

/** A model double whose structured call always throws. */
class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]): Promise<never> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('boom');
  }
}

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

d('GET / POST /pulls/:id/brief (Testcontainers pg)', () => {
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

  interface AppOpts {
    /** The risk_brief model double; `null` = no override, so the key check runs. */
    openai?: MockLLMProvider | null;
    openrouter?: MockLLMProvider;
    github?: MockGitHubClient;
    git?: MockGitClient;
    env?: Record<string, string>;
  }

  /** Fresh app + fresh LLM doubles per test, so call counts are the test's own. */
  async function appWith(o: AppOpts = {}) {
    const openai = o.openai === null ? undefined : (o.openai ?? new MockLLMProvider('openai', { structuredBySchema: { PrRiskBrief: BRIEF_ANSWER } }));
    const openrouter =
      o.openrouter ??
      new MockLLMProvider('openai', { structuredBySchema: { PrIntentClassification: INTENT_ANSWER } });
    const github = o.github ?? new MockGitHubClient();
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...o.env } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: o.git ?? new MockGitClient({ diff: '' }),
        github,
        llm: { ...(openai ? { openai } : {}), openrouter },
      },
    });
    return { app, openai: openai as MockLLMProvider, openrouter, github };
  }

  /** The real pino logger, written to fd 1 (NODE_ENV=production), for the log-line cases. */
  function loggedApp(o: AppOpts = {}) {
    stdout = interceptStdout();
    return appWith({ ...o, env: { NODE_ENV: 'production', LOG_LEVEL: 'info' } });
  }

  const structuredCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');
  const userMessage = (llm: MockLLMProvider): string => {
    const req = structuredCalls(llm)[0]!.req as { messages: { role: string; content: string }[] };
    return req.messages.find((m) => m.role === 'user')!.content;
  };

  async function setupPr(
    opts: { intent?: boolean | 'stale'; files?: boolean | number; cloned?: boolean; ws?: string } = {},
  ) {
    const db = pg.handle.db;
    const ws = opts.ws ?? workspaceId;
    const name = `brief-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId: ws,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        ...(opts.cloned ? { clonePath: `/mock/clones/acme/${name}` } : {}),
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 7,
        title: TITLE_SENTINEL,
        author: 'marisa.koch',
        branch: 'feat/brief',
        base: 'main',
        headSha: OLD_HEAD,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: BODY_SENTINEL,
      })
      .returning();
    if (opts.files !== false) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: PATCH });
      const extra = typeof opts.files === 'number' ? opts.files : 0;
      if (extra > 0) {
        await db.insert(t.prFiles).values(
          Array.from({ length: extra }, (_, i) => ({
            prId: pr!.id,
            path: `src/extra${i}.ts`,
            additions: 1,
            deletions: 0,
            patch: null,
          })),
        );
      }
    }
    if (opts.intent) {
      await db.insert(t.prIntent).values({
        prId: pr!.id,
        intent: 'Stored intent',
        inScope: ['api'],
        outOfScope: [],
        confidence: 'medium',
        sources: [],
        headSha: opts.intent === 'stale' ? 'older0000' : OLD_HEAD,
        inputHash: 'stored-hash',
        provider: 'openrouter',
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
        derivedAt: new Date('2026-09-01T00:00:00Z'),
      });
    }
    return pr!;
  }

  const briefRows = async (prId: string) => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  const intentRows = async (prId: string) => pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  const post = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
    app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
  const get = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
    app.inject({ method: 'GET', url: `/pulls/${id}/brief` });

  // ------------------------------------------------------------------ T1

  it('AC-1: GET with no stored brief -> 200 {brief:null, generating:false, stale:false}', async () => {
    const { app } = await appWith();
    const pr = await setupPr();
    const res = await get(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, generating: false, stale: false });
  });

  it('AC-5 / AC-7 / AC-12: POST with a stored intent makes one risk_brief call and stores the grounded brief', async () => {
    const { app, openai, openrouter } = await appWith();
    const pr = await setupPr({ intent: true });
    const res = await post(app, pr.id);
    const body = res.json() as Json;
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.brief.summary).toBe('S');
    expect(body.stale).toBe(false);
    expect(body.generating).toBe(false);
    // The focus item is on a changed line, kept; the risk's `:11-12` suffix is stripped and the unknown file dropped.
    expect(body.brief.review_focus).toEqual([{ file: 'src/a.ts', line: 11, reason: 'R' }]);
    expect(body.brief.risks.risks[0].file_refs).toEqual(['src/a.ts']);

    const brief = structuredCalls(openai);
    expect(brief).toHaveLength(1);
    expect(brief[0]!.req).toMatchObject({ schemaName: 'PrRiskBrief', model: 'gpt-4.1' });
    // The intent was stored, so the review_intent model is not called.
    expect(structuredCalls(openrouter)).toHaveLength(0);

    const rows = await briefRows(pr.id);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.json as Json).generation.head_sha).toBe(OLD_HEAD);
  });

  it('AC-2: GET after a POST returns the same brief and calls no model', async () => {
    const { app, openai, openrouter } = await appWith();
    const pr = await setupPr({ intent: true });
    const posted = await post(app, pr.id);
    expect(posted.statusCode).toBe(200);
    const briefCallsBefore = structuredCalls(openai).length;
    const intentCallsBefore = structuredCalls(openrouter).length;

    const res = await get(app, pr.id);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as Json).brief).toEqual((posted.json() as Json).brief);
    expect(structuredCalls(openai)).toHaveLength(briefCallsBefore);
    expect(structuredCalls(openrouter)).toHaveLength(intentCallsBefore);
  });

  it('AC-3: stale is true exactly while generation.head_sha differs from the PR head', async () => {
    const { app } = await appWith();
    const pr = await setupPr({ intent: true });
    const posted = await post(app, pr.id);
    expect(posted.statusCode).toBe(200);

    const setHead = (sha: string) =>
      pg.handle.db.update(t.pullRequests).set({ headSha: sha }).where(eq(t.pullRequests.id, pr.id));

    const same = await get(app, pr.id);
    expect((same.json() as Json).stale).toBe(false);

    await setHead(NEW_HEAD);
    const moved = await get(app, pr.id);
    expect(moved.statusCode).toBe(200);
    expect((moved.json() as Json).stale).toBe(true);
    // The brief stays; only the marker changes.
    expect((moved.json() as Json).brief.summary).toBe('S');

    await setHead(OLD_HEAD);
    const back = await get(app, pr.id);
    await app.close();
    expect((back.json() as Json).stale).toBe(false);
  });

  it('AC-6: POST with no stored intent derives and stores one first; the brief carries it', async () => {
    const { app, openai, openrouter } = await appWith();
    const pr = await setupPr();
    expect(await intentRows(pr.id)).toHaveLength(0);

    const res = await post(app, pr.id);
    const body = res.json() as Json;
    await app.close();

    expect(res.statusCode).toBe(200);
    const rows = await intentRows(pr.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.intent).toBe('Do X');
    expect(body.brief.intent.intent).toBe('Do X');
    expect(structuredCalls(openrouter)).toHaveLength(1);
    expect(structuredCalls(openai)).toHaveLength(1);
  });

  it('AC-7: two POSTs leave exactly one pr_brief row for the PR', async () => {
    const { app } = await appWith();
    const pr = await setupPr({ intent: true });
    const first = await post(app, pr.id);
    const second = await post(app, pr.id);
    await app.close();
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const res = await pg.handle.db.execute(sql`select count(*)::int as n from pr_brief where pr_id = ${pr.id}`);
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { n: number }[];
    expect(rows[0]!.n).toBe(1);
  });

  // ------------------------------------------------------------------ T2

  it('AC-4 / AC-51: an unknown or foreign PR is 404 "Pull request not found" on GET and POST; a non-uuid id is 422', async () => {
    const { app, openai } = await appWith();
    const unknown = '00000000-0000-4000-8000-000000000000';
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'brief-other' }).returning();
    const foreign = await setupPr({ ws: otherWs!.id, intent: true });

    for (const id of [unknown, foreign.id]) {
      for (const method of ['GET', 'POST'] as const) {
        const res = await app.inject({ method, url: `/pulls/${id}/brief` });
        expect(res.statusCode, `${method} ${id}`).toBe(404);
        expect(res.json().error.message).toBe('Pull request not found');
      }
    }
    for (const method of ['GET', 'POST'] as const) {
      expect((await app.inject({ method, url: '/pulls/abc/brief' })).statusCode, method).toBe(422);
    }
    await app.close();
    expect(structuredCalls(openai)).toHaveLength(0);
    expect(await briefRows(foreign.id)).toHaveLength(0);
  });

  it('A-11: a stored intent is used as it is even when stale; no intent call is made', async () => {
    const { app, openrouter } = await appWith();
    const pr = await setupPr({ intent: 'stale' });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(200);
    expect((res.json() as Json).brief.intent.intent).toBe('Stored intent');
    expect(structuredCalls(openrouter)).toHaveLength(0);
  });

  it('AC-8 / NFR-3 / NFR-6: the prompt holds the intent, files and diff, carries no PR title or body, and the request has no tools', async () => {
    const { app, openai } = await appWith();
    const pr = await setupPr({ intent: true });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(200);

    const user = userMessage(openai);
    for (const fact of ['Stored intent', 'src/a.ts', 'add11']) expect(user, fact).toContain(fact);
    expect(user.match(/<untrusted/g)).toHaveLength(1);
    expect(user).not.toContain(BODY_SENTINEL);
    expect(user).not.toContain(TITLE_SENTINEL);
    const req = structuredCalls(openai)[0]!.req as Record<string, unknown>;
    expect(req).not.toHaveProperty('tools');
    expect(req).toMatchObject({ maxTokens: 6000, maxRetries: 1 });
  });

  it('AC-9: the docs of every ENABLED agent, own and shared, each once, agents by name; none of a disabled agent', async () => {
    const HEAD = 'a1b2c3d4';
    const git = new MockGitClient({
      diff: '',
      head: HEAD,
      filesAtRef: {
        [`${HEAD}:docs/x.md`]: 'DOC-X-TEXT',
        [`${HEAD}:docs/y.md`]: 'DOC-Y-TEXT',
        [`${HEAD}:docs/z.md`]: 'DOC-Z-TEXT',
      },
    });
    const { app, openai } = await appWith({ git });
    const pr = await setupPr({ intent: true, cloned: true });

    const mk = async (name: string, items: { path: string; position: number | null }[]) => {
      const created = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a reviewer.' },
      });
      expect(created.statusCode).toBe(201);
      const { id } = created.json() as { id: string };
      const put = await app.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { items } });
      expect(put.statusCode).toBe(200);
      return id;
    };
    // Created Bravo first so the database order is NOT the name order.
    const bravo = await mk('T2-Bravo', [
      { path: 'docs/x.md', position: 0 },
      { path: 'docs/y.md', position: 1 },
    ]);
    const alpha = await mk('T2-Alpha', [{ path: 'docs/y.md', position: 0 }]);
    const charlie = await mk('T2-Charlie', [{ path: 'docs/z.md', position: 0 }]);
    try {
      await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, charlie));
      const res = await post(app, pr.id);
      expect(res.statusCode).toBe(200);
      // Alpha first (y.md), then Bravo (x.md; its y.md was already taken); Charlie is disabled.
      expect((res.json() as Json).brief.generation.specs_read).toEqual(['docs/y.md', 'docs/x.md']);
      const user = userMessage(openai);
      expect(user).toContain('DOC-X-TEXT');
      expect(user).toContain('DOC-Y-TEXT');
      expect(user).not.toContain('DOC-Z-TEXT');
    } finally {
      // Leave nothing enabled that carries docs for the cases that follow.
      await pg.handle.db.update(t.agents).set({ enabled: false }).where(inArray(t.agents.id, [alpha, bravo]));
      await app.close();
    }
  });

  it('AC-14: a blank summary is 502 with the empty-summary message and the earlier row is unchanged', async () => {
    const first = await appWith();
    const pr = await setupPr({ intent: true });
    expect((await post(first.app, pr.id)).statusCode).toBe(200);
    await first.app.close();
    const before = JSON.stringify((await briefRows(pr.id))[0]!.json);

    const blank = new MockLLMProvider('openai', {
      structuredBySchema: { PrRiskBrief: { ...BRIEF_ANSWER, summary: '   ' } },
    });
    const { app } = await appWith({ openai: blank });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe('Brief generation failed: the model returned an empty summary.');
    expect(JSON.stringify((await briefRows(pr.id))[0]!.json)).toBe(before);
  });

  it('AC-15: no risk_brief key -> 422 "OPENAI_API_KEY is not configured", no model call and no intent row', async () => {
    const { app, openrouter } = await appWith({ openai: null });
    const pr = await setupPr();
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe('OPENAI_API_KEY is not configured');
    expect(structuredCalls(openrouter)).toHaveLength(0);
    expect(await intentRows(pr.id)).toHaveLength(0);
    expect(await briefRows(pr.id)).toHaveLength(0);
  });

  it('AC-16: an intent derivation that throws is 502 "Intent derivation failed: …", no brief call, stored brief unchanged', async () => {
    const first = await appWith();
    const pr = await setupPr({ intent: true });
    expect((await post(first.app, pr.id)).statusCode).toBe(200);
    await first.app.close();
    const before = JSON.stringify((await briefRows(pr.id))[0]!.json);
    // No stored intent any more, so the next POST has to derive one.
    await pg.handle.db.delete(t.prIntent).where(eq(t.prIntent.prId, pr.id));

    const { app, openai } = await appWith({ openrouter: new ThrowingLLM('openai') });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toMatch(/^Intent derivation failed:/);
    expect(structuredCalls(openai)).toHaveLength(0);
    expect(JSON.stringify((await briefRows(pr.id))[0]!.json)).toBe(before);
  });

  it('AC-17: a throwing brief call is 502 "Brief generation failed: boom" and the stored row is byte-identical', async () => {
    const first = await appWith();
    const pr = await setupPr({ intent: true });
    expect((await post(first.app, pr.id)).statusCode).toBe(200);
    await first.app.close();
    const before = JSON.stringify((await briefRows(pr.id))[0]!.json);

    const { app } = await appWith({ openai: new ThrowingLLM('openai') });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe('Brief generation failed: boom');
    expect(JSON.stringify((await briefRows(pr.id))[0]!.json)).toBe(before);
  });

  it('AC-18 / AC-19: while one POST runs, a second gets 409 and a GET says generating:true; the model is called once', async () => {
    const gated = new GatedLLM('openai', { structuredBySchema: { PrRiskBrief: BRIEF_ANSWER } });
    const { app } = await appWith({ openai: gated });
    const pr = await setupPr({ intent: true });
    let first: Promise<Awaited<ReturnType<typeof post>>> | undefined;
    try {
      first = post(app, pr.id);
      const end = Date.now() + 3000;
      while (gated.started < 1 && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
      expect(gated.started).toBe(1);

      // Raced against a short timeout, so a missing guard fails in ~3 s instead of waiting on the gate.
      const second = await Promise.race([
        post(app, pr.id),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      expect(second, 'the second POST must answer while the first is running').not.toBeNull();
      expect(second!.statusCode).toBe(409);
      expect(second!.json().error.message).toBe('A brief is already being generated for this pull request.');
      expect(second!.json().error.code).toBe('brief_in_progress');

      const state = await get(app, pr.id);
      expect((state.json() as Json).generating).toBe(true);
      expect(gated.started).toBe(1);
    } finally {
      gated.release();
    }
    const done = await first!;
    expect(done.statusCode).toBe(200);
    expect(((await get(app, pr.id)).json() as Json).generating).toBe(false);
    await app.close();
  });

  it('AC-20: with no usable index the brief is still stored, blast.degraded is true with a reason, and the prompt names it incomplete', async () => {
    const { app, openai } = await appWith({ env: { REPO_INTEL_ENABLED: 'false' } });
    const pr = await setupPr({ intent: true });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(200);
    const blast = (res.json() as Json).brief.blast;
    expect(blast).toMatchObject({ degraded: true, reason: 'flag_off' });
    expect(userMessage(openai)).toContain('flag_off');
    expect((((await briefRows(pr.id))[0]!.json) as Json).blast).toMatchObject({ degraded: true, reason: 'flag_off' });
  });

  it('AC-21 / NFR-7: GitHub failing for history still stores the brief (github_unavailable); with 25 files at most 20 commit lists and 10 summaries are asked', async () => {
    const paths = ['src/a.ts', ...Array.from({ length: 25 }, (_, i) => `src/extra${i}.ts`)];
    const failing: MockGitHubOptions = { commitsByPath: Object.fromEntries(paths.map((p) => [p, null])) };
    const down = await appWith({ github: new MockGitHubClient(failing) });
    const pr = await setupPr({ intent: true });
    const res = await post(down.app, pr.id);
    await down.app.close();
    expect(res.statusCode).toBe(200);
    expect((res.json() as Json).brief.history).toMatchObject({ degraded: true, reason: 'github_unavailable' });

    // 25 extra files, each with a commit that names a different PR: 26 candidates.
    const busy: MockGitHubOptions = {
      commitsByPath: Object.fromEntries(
        paths.map((p, i) => [p, [{ sha: `s${i}`, message: `Change ${i} (#${100 + i})`, date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }]]),
      ),
    };
    const gh = new MockGitHubClient(busy);
    const many = await appWith({ github: gh });
    const pr2 = await setupPr({ intent: true, files: 25 });
    const res2 = await post(many.app, pr2.id);
    await many.app.close();
    expect(res2.statusCode).toBe(200);
    expect(gh.commitCalls.length).toBeGreaterThan(0);
    expect(gh.commitCalls.length).toBeLessThanOrEqual(20);
    expect(gh.summaryCalls.length).toBeGreaterThan(0);
    expect(gh.summaryCalls.length).toBeLessThanOrEqual(10);
  });

  it('AC-22: a PR with no changed files is 422 with the no-files message and no model call', async () => {
    const { app, openai, openrouter } = await appWith();
    const pr = await setupPr({ files: false, intent: true });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe('This pull request has no changed files to brief yet.');
    expect(structuredCalls(openai)).toHaveLength(0);
    expect(structuredCalls(openrouter)).toHaveLength(0);
  });

  it('AC-23: a stored row that does not parse reads as brief:null and logs one warn "brief: unreadable" with the prId', async () => {
    const { app } = await loggedApp();
    const pr = await setupPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { x: 1 } });
    const res = await get(app, pr.id);
    await stdout!.until((l) => l.msg === 'brief: unreadable');
    await app.close();
    expect(res.statusCode).toBe(200);
    expect((res.json() as Json).brief).toBeNull();
    const lines = stdout!.printed.filter((l) => l.msg === 'brief: unreadable');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 40, prId: pr.id });
  });

  it('REC-1 / NFR-9: a successful POST logs exactly one prompt: assembled line with kind brief and no fact text', async () => {
    const { app } = await loggedApp();
    const pr = await setupPr({ intent: true });
    const res = await post(app, pr.id);
    await stdout!.until((l) => l.msg === 'request completed');
    await app.close();
    expect(res.statusCode).toBe(200);

    const lines = stdout!.printed.filter((l) => l.msg === 'prompt: assembled');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'brief', provider: 'openai', model: 'gpt-4.1' });
    expect(JSON.stringify(lines[0])).not.toContain('add11');
    const all = stdout!.raw.join('\n');
    for (const needle of ['add11', BODY_SENTINEL, TITLE_SENTINEL]) expect(all, needle).not.toContain(needle);
  });

  it('NFR-8: the stored generation copies model and tokens and keeps a null cost null', async () => {
    const openai = new MockLLMProvider('openai', {
      costUsd: null,
      structuredBySchema: { PrRiskBrief: BRIEF_ANSWER },
    });
    const { app } = await appWith({ openai });
    const pr = await setupPr({ intent: true });
    const res = await post(app, pr.id);
    await app.close();
    expect(res.statusCode).toBe(200);
    const stored = ((await briefRows(pr.id))[0]!.json as Json).generation;
    expect(stored.cost_usd).toBeNull();
    expect(stored).toMatchObject({ tokens_in: 100, tokens_out: 50, model: 'gpt-4.1', provider: 'openai' });
  });

  it('NFR-9: one "brief: generated" info line carries the identifying, cost and degradation fields and no text', async () => {
    const { app } = await loggedApp();
    const pr = await setupPr({ intent: true });
    const res = await post(app, pr.id);
    await stdout!.until((l) => l.msg === 'brief: generated');
    await app.close();
    expect(res.statusCode).toBe(200);

    const lines = stdout!.printed.filter((l) => l.msg === 'brief: generated');
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.level).toBe(30);
    expect(line).toMatchObject({
      prId: pr.id,
      headSha: OLD_HEAD,
      provider: 'openai',
      model: 'gpt-4.1',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    });
    for (const key of ['durationMs', 'specsRead', 'blastDegraded', 'historyDegraded']) {
      expect(line, key).toHaveProperty(key);
    }
    expect(typeof line.durationMs).toBe('number');
    expect(typeof line.blastDegraded).toBe('boolean');
    expect(typeof line.historyDegraded).toBe('boolean');
    expect(stdout!.raw.join('\n')).not.toContain('add11');
  });

  it('NFR-9: the line reports kept and dropped counts of focus items and of file refs', async () => {
    // BRIEF_ANSWER: 1 focus item kept; 2 refs offered, 1 kept ("src/a.ts") and 1 dropped ("nope.ts").
    const { app } = await loggedApp();
    const pr = await setupPr({ intent: true });
    await post(app, pr.id);
    await stdout!.until((l) => l.msg === 'brief: generated');
    await app.close();
    const line = stdout!.printed.find((l) => l.msg === 'brief: generated')!;
    const countKey = (subject: RegExp, outcome: RegExp) =>
      Object.keys(line).filter((k) => subject.test(k) && outcome.test(k));
    for (const [subject, outcome] of [
      [/focus/i, /kept/i],
      [/focus/i, /dropped/i],
      [/ref/i, /kept/i],
      [/ref/i, /dropped/i],
    ] as const) {
      const keys = countKey(subject, outcome);
      expect(keys, `${subject} ${outcome}`).toHaveLength(1);
      expect(typeof line[keys[0]!]).toBe('number');
    }
    const value = (s: RegExp, o: RegExp) => line[countKey(s, o)[0]!];
    expect(value(/focus/i, /kept/i)).toBe(1);
    expect(value(/focus/i, /dropped/i)).toBe(0);
    expect(value(/ref/i, /kept/i)).toBe(1);
    expect(value(/ref/i, /dropped/i)).toBe(1);
  });

  it('NFR-9 / A-32: a failing POST logs exactly one "brief: failed" warn line with the reason, for a 502 and for a 422 after the guard', async () => {
    const boom = await loggedApp({ openai: new ThrowingLLM('openai') });
    const pr = await setupPr({ intent: true });
    expect((await post(boom.app, pr.id)).statusCode).toBe(502);
    await stdout!.until((l) => l.msg === 'brief: failed');
    await boom.app.close();
    const failed = stdout!.printed.filter((l) => l.msg === 'brief: failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ level: 40, prId: pr.id });
    expect(String(failed[0]!.reason)).toContain('boom');
    stdout!.restore();

    const noFiles = await loggedApp();
    const empty = await setupPr({ files: false, intent: true });
    expect((await post(noFiles.app, empty.id)).statusCode).toBe(422);
    await stdout!.until((l) => l.msg === 'brief: failed');
    await noFiles.app.close();
    const failed422 = stdout!.printed.filter((l) => l.msg === 'brief: failed');
    expect(failed422).toHaveLength(1);
    expect(failed422[0]).toHaveProperty('reason');
    expect(stdout!.printed.filter((l) => l.msg === 'brief: generated')).toHaveLength(0);
  });

  it('NFR-12: the 11th POST within a minute is 429 (rate limiting is on only outside NODE_ENV=test)', async () => {
    const { app } = await appWith({ env: { NODE_ENV: 'development' } });
    const pr = await setupPr({ intent: true });
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(app, pr.id)).statusCode);
    await app.close();
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes[10]).toBe(429);
  });
});
