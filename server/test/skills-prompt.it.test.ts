import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-prompt] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A clean review — this suite asserts on the PROMPT, not on findings. */
const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Nothing to flag.',
  score: 100,
  findings: [],
};

/**
 * L02 — the payoff: an agent's attached skills become ordered markdown blocks in
 * the assembled prompt. Asserts against the messages the LLM adapter actually
 * received, so it covers the whole path run-executor → reviewer-core →
 * assemblePrompt, plus the persisted run trace.
 */
d('skills reach the assembled prompt', () => {
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

  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  async function setupPr() {
    const db = pg.handle.db;
    const name = `skills-api-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
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
        headSha: 'a1b2c3d4',
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

  async function makeSkill(
    app: Awaited<ReturnType<typeof appWith>>,
    name: string,
    body: string,
    enabled = true,
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: name, type: 'custom', body, enabled },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function makeAgent(app: Awaited<ReturnType<typeof appWith>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Reviewer-${repoSeq}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    return res.json() as { id: string };
  }

  /** The user message the mock LLM was actually asked to complete. */
  function userPrompt(llm: MockLLMProvider): string {
    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call, 'expected the reviewer to call completeStructured').toBeDefined();
    const req = call!.req as { messages: { role: string; content: string }[] };
    const user = req.messages.find((m) => m.role === 'user');
    return user!.content;
  }

  async function runReview(app: Awaited<ReturnType<typeof appWith>>, prId: string, agentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    return res.json() as { runs: { run_id: string }[] };
  }

  it('injects attached skills in link order, under "## Skills / rules"', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const pr = await setupPr();
    const agent = await makeAgent(app);

    const first = await makeSkill(app, 'alpha', '# Alpha\n\nAlpha rule.');
    const second = await makeSkill(app, 'beta', '# Beta\n\nBeta rule.');

    // Deliberately submit beta BEFORE alpha: array order is prompt order, and
    // must win over creation order / name order.
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: second.id }, { skill_id: first.id }] },
    });
    expect(linked.statusCode).toBe(200);

    await runReview(app, pr.id, agent.id);

    const prompt = userPrompt(llm);
    expect(prompt).toContain('## Skills / rules');
    expect(prompt).toContain('Alpha rule.');
    expect(prompt).toContain('Beta rule.');
    expect(prompt.indexOf('Beta rule.')).toBeLessThan(prompt.indexOf('Alpha rule.'));
  });

  it('omits the section entirely when the agent has no skills', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const pr = await setupPr();
    const agent = await makeAgent(app);

    await runReview(app, pr.id, agent.id);

    // The pre-L02 prompt must be byte-identical: no header, no stray blank block.
    expect(userPrompt(llm)).not.toContain('## Skills / rules');
  });

  it('excludes a skill muted on the link but keeps the others', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const pr = await setupPr();
    const agent = await makeAgent(app);

    const on = await makeSkill(app, 'link-on', '# On\n\nIncluded rule.');
    const off = await makeSkill(app, 'link-off', '# Off\n\nMuted-by-link rule.');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: on.id, enabled: true },
          { skill_id: off.id, enabled: false },
        ],
      },
    });

    await runReview(app, pr.id, agent.id);

    const prompt = userPrompt(llm);
    expect(prompt).toContain('Included rule.');
    expect(prompt).not.toContain('Muted-by-link rule.');
  });

  it('excludes a globally disabled skill even when the link is enabled', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const pr = await setupPr();
    const agent = await makeAgent(app);

    const on = await makeSkill(app, 'global-on', '# On\n\nStill included.');
    const off = await makeSkill(app, 'global-off', '# Off\n\nGlobally disabled rule.', false);

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: on.id, enabled: true },
          { skill_id: off.id, enabled: true }, // link says yes, the skill says no
        ],
      },
    });

    await runReview(app, pr.id, agent.id);

    const prompt = userPrompt(llm);
    expect(prompt).toContain('Still included.');
    expect(prompt).not.toContain('Globally disabled rule.');
  });

  it('records the skills block in the persisted run trace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const pr = await setupPr();
    const agent = await makeAgent(app);

    const s = await makeSkill(app, 'traced', '# Traced\n\nTraceable rule.');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: s.id }] },
    });

    const { runs } = await runReview(app, pr.id, agent.id);
    const trace = await app.inject({ method: 'GET', url: `/runs/${runs[0]!.run_id}/trace` });
    expect(trace.statusCode).toBe(200);
    expect(trace.json().prompt_assembly.skills).toContain('Traceable rule.');
  });

  it('rejects linking a skill from another workspace', async () => {
    const db = pg.handle.db;
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await makeAgent(app);

    const [foreignWs] = await db
      .insert(t.workspaces)
      .values({ name: `other-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    const [foreignSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId: foreignWs!.id,
        name: 'foreign',
        description: 'not yours',
        type: 'custom',
        source: 'manual',
        body: '# Foreign\n\nAnother tenant text.',
      })
      .returning();

    // The FK would accept this happily — only the service check stops it.
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: foreignSkill!.id }] },
    });
    expect(res.statusCode).toBe(422);

    const links = await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` });
    expect(links.json()).toHaveLength(0);
  });

  it('unlinks a single skill via DELETE, preserving the rest of the order', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agent = await makeAgent(app);

    const a = await makeSkill(app, 'keep-a', '# A\n\nA.');
    const b = await makeSkill(app, 'drop-b', '# B\n\nB.');
    const c = await makeSkill(app, 'keep-c', '# C\n\nC.');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: a.id }, { skill_id: b.id }, { skill_id: c.id }] },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agent.id}/skills/${b.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { skill_id: string }[]).map((l) => l.skill_id)).toEqual([a.id, c.id]);
  });
});
