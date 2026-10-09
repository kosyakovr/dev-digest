import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockPrIntent } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoRef, Review } from '@devdigest/shared';

type Item = { path: string; position: number | null };

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-run] Docker not available — skipping integration tests.');
}

const HEAD = 'a1b2c3d4';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A clean review — this suite asserts on the PROMPT and the TRACE, not on findings. */
const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Nothing to flag.',
  score: 100,
  findings: [],
};

/** The clone's docs at HEAD. Token counts: ceil(chars / 4). */
const FILES_AT_HEAD: Record<string, string> = {
  [`${HEAD}:specs/x.md`]: 'XX', // 1 token
  [`${HEAD}:specs/b.md`]: 'BBBB', // 1 token
  [`${HEAD}:docs/z.md`]: 'Z', // 1 token
  [`${HEAD}:docs/s.md`]: 'SSSSS', // 2 tokens
};

const block = (path: string, text: string) => `<untrusted source="${path}">\n${text}\n</untrusted>`;

type TraceEntry = {
  path: string;
  tokens: number;
  status: 'included' | 'skipped';
  reason?: string;
  via_skill: { id: string; name: string } | null;
  text: string | null;
};

/**
 * L05 — the payoff: the docs attached to an agent and to its skills reach the
 * assembled prompt as path-labelled untrusted blocks, in a fixed order, and the
 * persisted run trace records what was read.
 */
d('project context reaches the run', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: MockLLMProvider, git?: MockGitClient) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: git ?? new MockGitClient({ diff: DIFF, head: HEAD, filesAtRef: FILES_AT_HEAD }),
        intent: new MockPrIntent(),
        llm: { openai: llm },
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  async function setupPr(opts: { cloned?: boolean } = {}) {
    const db = pg.handle.db;
    const name = `ctx-run-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: opts.cloned === false ? null : `/mock/clones/acme/${name}`,
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: HEAD,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Ctx-Reviewer-${repoSeq}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function makeSkill(app: App, name: string, body = '# Rule\n\nBe careful.') {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: name, type: 'custom', body },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  it('adds attached and inherited docs to the prompt in A-5 order and records them in the trace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const pr = await setupPr();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app, 'Sec');

    // The agent: one positioned doc, two unpositioned (docs/z.md sorts before
    // specs/b.md by source name). The skill adds docs/s.md.
    const agentPut = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: {
        items: [
          { path: 'specs/x.md', position: 0 },
          { path: 'specs/b.md', position: null },
          { path: 'docs/z.md', position: null },
        ],
      },
    });
    expect(agentPut.statusCode).toBe(200);
    const skillPut = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { items: [{ path: 'docs/s.md', position: null }] },
    });
    expect(skillPut.statusCode).toBe(200);
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: true }] },
    });
    expect(linked.statusCode).toBe(200);

    const review = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(review.statusCode).toBe(200);
    const { runs } = review.json() as { runs: { run_id: string }[] };
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // One LLM request, whose user message holds the section and the four blocks in order.
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as { messages: { role: string; content: string }[] };
    const user = req.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Project context');
    const at = [
      block('specs/x.md', 'XX'),
      block('docs/z.md', 'Z'),
      block('specs/b.md', 'BBBB'),
      block('docs/s.md', 'SSSSS'),
    ].map((b) => user.indexOf(b));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);

    // The persisted trace.
    const res = await app.inject({ method: 'GET', url: `/runs/${runs[0]!.run_id}/trace` });
    expect(res.statusCode).toBe(200);
    const trace = res.json() as { specs_read: string[]; project_context?: TraceEntry[] };
    expect(trace.specs_read).toEqual(['specs/x.md', 'docs/z.md', 'specs/b.md', 'docs/s.md']);

    const entries = trace.project_context ?? [];
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.status === 'included')).toBe(true);
    expect(entries.map((e) => e.via_skill)).toEqual([
      null,
      null,
      null,
      { id: skill.id, name: 'Sec' },
    ]);
    expect(entries.map((e) => e.tokens)).toEqual([1, 1, 1, 2]);
    expect(entries[0]!.text).toBe('<untrusted source="specs/x.md">\nXX\n</untrusted>');
  });

  // ======================= T2: skips, logs, edges =======================

  const filesAt = (m: Record<string, string>) =>
    Object.fromEntries(Object.entries(m).map(([p, text]) => [`${HEAD}:${p}`, text]));

  interface RunOpts {
    files: Record<string, string>;
    /** The agent's own attachments (PUT before the run). */
    items?: Item[];
    /** Skills linked in this order; each may carry its own attachments. */
    skills?: { name: string; body?: string; items?: Item[] }[];
    cloned?: boolean;
    git?: MockGitClient;
    /** Do not require the trace GET to be 200 (the caller asserts on it). */
    lenientTrace?: boolean;
  }

  /** Attach, link, run one agent on a fresh PR, and read back the trace and the prompt. */
  async function runWith(o: RunOpts) {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const git = o.git ?? new MockGitClient({ diff: DIFF, head: HEAD, filesAtRef: filesAt(o.files) });
    const app = await appWith(llm, git);
    const pr = await setupPr({ cloned: o.cloned });
    const agent = await makeAgent(app);

    if (o.items) {
      const res = await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { items: o.items } });
      expect(res.statusCode).toBe(200);
    }
    const links: { skill_id: string; enabled: boolean }[] = [];
    const skills: { id: string; name: string }[] = [];
    for (const s of o.skills ?? []) {
      const skill = await makeSkill(app, `${s.name}-${repoSeq}`, s.body);
      skills.push({ id: skill.id, name: skill.name });
      links.push({ skill_id: skill.id, enabled: true });
      if (s.items) {
        const res = await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context`, payload: { items: s.items } });
        expect(res.statusCode).toBe(200);
      }
    }
    if (links.length > 0) {
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skills: links } });
      expect(res.statusCode).toBe(200);
    }

    const review = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(review.statusCode).toBe(200);
    const { runs } = review.json() as { runs: { run_id: string }[] };
    const finished = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const res = await app.inject({ method: 'GET', url: `/runs/${runs[0]!.run_id}/trace` });
    // A test about a missing trace asserts on it itself, after the run's status and error.
    if (!o.lenientTrace) expect(res.statusCode).toBe(200);
    const trace = res.json() as {
      specs_read: string[];
      project_context?: TraceEntry[];
      log: { msg: string }[];
    };
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    const user =
      calls.length > 0
        ? (calls[0]!.req as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'user')!.content
        : '';
    return {
      llm,
      git,
      app,
      pr,
      agent,
      skills,
      trace,
      calls,
      user,
      status: finished[0]?.status,
      error: finished[0]?.error,
      traceStatus: res.statusCode,
    };
  }

  it('skips a deleted doc and finishes the run: skipped/not_found, in neither the prompt nor specs_read', async () => {
    const r = await runWith({
      files: { 'specs/x.md': 'XX' },
      items: [
        { path: 'specs/x.md', position: null },
        { path: 'specs/gone.md', position: null },
      ],
    });
    expect(r.status).toBe('done');
    expect(r.trace.project_context).toContainEqual({
      path: 'specs/gone.md',
      tokens: 0,
      status: 'skipped',
      reason: 'not_found',
      via_skill: null,
      text: null,
    });
    expect(r.trace.specs_read).toEqual(['specs/x.md']);
    expect(r.user).not.toContain('specs/gone.md');
  });

  it('skips a 200,001-byte doc as too_large', async () => {
    const r = await runWith({
      files: { 'docs/big.md': 'a'.repeat(200_001), 'docs/ok.md': 'ok' },
      items: [
        { path: 'docs/big.md', position: null },
        { path: 'docs/ok.md', position: null },
      ],
    });
    expect(r.status).toBe('done');
    expect(r.trace.project_context!.find((e) => e.path === 'docs/big.md')).toMatchObject({
      status: 'skipped',
      reason: 'too_large',
      tokens: 0,
      text: null,
    });
    expect(r.user).not.toContain('docs/big.md');
    expect(r.trace.specs_read).toEqual(['docs/ok.md']);
  });

  it('skips a doc whose bytes cannot be decoded as unreadable', async () => {
    class BadUtf8Git extends MockGitClient {
      override async readFileAtRef(repo: RepoRef, ref: string, path: string, maxBytes: number) {
        if (path === 'docs/bad.md') return { text: '�', bytes: 1 };
        return super.readFileAtRef(repo, ref, path, maxBytes);
      }
    }
    const git = new BadUtf8Git({ diff: DIFF, head: HEAD, filesAtRef: filesAt({ 'docs/bad.md': 'x', 'docs/ok.md': 'ok' }) });
    const r = await runWith({
      files: {},
      git,
      items: [
        { path: 'docs/bad.md', position: null },
        { path: 'docs/ok.md', position: null },
      ],
    });
    expect(r.status).toBe('done');
    expect(r.trace.project_context!.find((e) => e.path === 'docs/bad.md')).toMatchObject({
      status: 'skipped',
      reason: 'unreadable',
      text: null,
    });
    expect(r.user).not.toContain('docs/bad.md');
  });

  it('has no run-time token budget: three 6,000-character docs are all included', async () => {
    const big = 'w'.repeat(6000);
    const r = await runWith({
      files: { 'docs/a.md': big, 'docs/b.md': big, 'docs/c.md': big },
      items: ['a', 'b', 'c'].map((n) => ({ path: `docs/${n}.md`, position: null })),
    });
    expect(r.trace.project_context!.map((e) => e.status)).toEqual(['included', 'included', 'included']);
    for (const n of ['a', 'b', 'c']) expect(r.user).toContain(`<untrusted source="docs/${n}.md">`);
  });

  it('reads only stored paths, whatever a doc says about other files', async () => {
    const r = await runWith({
      files: { 'docs/a.md': 'See ../secret.md and src/other.md and /etc/passwd', 'src/other.md': 'o' },
      items: [{ path: 'docs/a.md', position: null }],
    });
    expect(r.git.readsAtRef.map((x) => x.path)).toEqual(['docs/a.md']);
  });

  it("a doc's trace tokens equal its tokens in the list (AC-40)", async () => {
    const r = await runWith({
      files: { 'docs/a.md': 'abcdefgh' }, // 8 chars → 2 tokens
      items: [{ path: 'docs/a.md', position: null }],
    });
    const list = await r.app.inject({ method: 'GET', url: `/repos/${r.pr.repoId}/context` });
    const listed = (list.json() as { path: string; tokens: number }[]).find((d) => d.path === 'docs/a.md')!;
    expect(listed.tokens).toBe(2);
    expect(r.trace.project_context![0]!.tokens).toBe(listed.tokens);
  });

  it('with no attachments the prompt, the trace and the log carry no project context (AC-41)', async () => {
    const r = await runWith({ files: { 'docs/a.md': 'A' } });
    expect(r.status).toBe('done');
    expect(r.user).not.toContain('## Project context');
    expect(r.trace).not.toHaveProperty('project_context');
    expect(r.trace.specs_read).toEqual([]);
    expect(r.trace.log.some((l) => l.msg.includes('Project context:'))).toBe(false);
  });

  it('keeps the skills in link order when attachments exist (AC-45)', async () => {
    const r = await runWith({
      files: { 'docs/a.md': 'A' },
      items: [{ path: 'docs/a.md', position: null }],
      skills: [
        { name: 'first', body: '# First\n\nFIRST-RULE' },
        { name: 'second', body: '# Second\n\nSECOND-RULE' },
      ],
    });
    expect(r.user).toContain('## Skills / rules');
    expect(r.user.indexOf('FIRST-RULE')).toBeGreaterThan(-1);
    expect(r.user.indexOf('FIRST-RULE')).toBeLessThan(r.user.indexOf('SECOND-RULE'));
    expect(r.user).toContain('<untrusted source="docs/a.md">');
  });

  it('attached docs add no LLM call (NFR-8)', async () => {
    const without = await runWith({ files: { 'docs/a.md': 'A' } });
    const withDocs = await runWith({ files: { 'docs/a.md': 'A' }, items: [{ path: 'docs/a.md', position: null }] });
    expect(without.calls).toHaveLength(1);
    expect(withDocs.calls).toHaveLength(without.calls.length);
    expect(withDocs.llm.calls).toHaveLength(without.llm.calls.length);
  });

  it('logs one summary line and one line per skipped doc (NFR-6)', async () => {
    const r = await runWith({
      files: { 'specs/x.md': 'XX', 'specs/b.md': 'BBBB', 'docs/z.md': 'Z' },
      items: [
        { path: 'specs/x.md', position: null },
        { path: 'specs/b.md', position: null },
        { path: 'docs/z.md', position: null },
        { path: 'specs/gone.md', position: null },
      ],
    });
    const msgs = r.trace.log.map((l) => l.msg);
    expect(msgs).toContain('Project context: 3 document(s) included (≈ 3 tokens), 1 skipped');
    expect(msgs).toContain('Project context: skipped specs/gone.md — not_found');
    expect(msgs.filter((m) => m.startsWith('Project context:'))).toHaveLength(2);
  });

  it('a doc attached directly and through a skill is included once, with via_skill null (R-34)', async () => {
    const r = await runWith({
      files: { 'docs/s.md': 'SSSSS' },
      items: [{ path: 'docs/s.md', position: null }],
      skills: [{ name: 'Sec', items: [{ path: 'docs/s.md', position: null }] }],
    });
    expect(r.trace.project_context).toHaveLength(1);
    expect(r.trace.project_context![0]!.via_skill).toBeNull();
    expect(r.user.split('<untrusted source="docs/s.md">').length - 1).toBe(1);
  });

  /**
   * SR-1 (security-reviewer r2): a doc whose text holds a NUL byte reaches the
   * trace (`entries[].text`, `prompt_assembly.specs`), and Postgres jsonb refuses
   * it (22P05). A run whose full trace cannot be saved must not end `done` with
   * no trace: it ends `failed` with the reason, and a (fallback) trace is still
   * readable once the run is terminal.
   */
  it('a trace that cannot be saved fails the run with an error, and a trace is still readable (SR-1)', async () => {
    const r = await runWith({
      files: { 'docs/nul.md': 'before\u0000after' },
      items: [{ path: 'docs/nul.md', position: null }],
      lenientTrace: true,
    });

    expect(r.status).toBe('failed');
    expect(r.error ?? '').not.toBe('');
    expect(r.traceStatus).toBe(200);
  });

  it('a repo without a clone skips every attached doc as not_found and still finishes (R-23)', async () => {
    const r = await runWith({
      files: { 'docs/a.md': 'A' },
      cloned: false,
      items: [{ path: 'docs/a.md', position: null }],
    });
    expect(r.status).toBe('done');
    expect(r.trace.project_context).toEqual([
      { path: 'docs/a.md', tokens: 0, status: 'skipped', reason: 'not_found', via_skill: null, text: null },
    ]);
    expect(r.trace.specs_read).toEqual([]);
    expect(r.user).not.toContain('## Project context');
  });
});
