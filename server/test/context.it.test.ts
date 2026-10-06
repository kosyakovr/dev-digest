import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider, MockPrIntent } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { GitHubClient } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

const HEAD = 'a1b2c3d4';

/** The clone's tree at HEAD: three docs under configured folders, three non-docs. */
const FILES_AT_HEAD: Record<string, string> = {
  [`${HEAD}:specs/b.md`]: '0123456789', // 10 chars → ceil(10/4) = 3 tokens
  [`${HEAD}:docs/a.md`]: '# A',
  [`${HEAD}:src/z.md`]: 'z', // .md, but not under a configured folder
  [`${HEAD}:x/docs/c.md`]: 'c', // configured folder at depth 1
  [`${HEAD}:docs/img.png`]: 'p', // not markdown
};

type Item = { path: string; position: number | null };

/**
 * L05 project context — the server half of the Context tab and the Project
 * Context page: the doc list per clone HEAD, the file read, and the per-agent /
 * per-skill attachment lists (PUT then GET round trip).
 */
d('project context routes', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;
  const agentIds: string[] = [];
  const skillIds: string[] = [];

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(
    over: { git?: MockGitClient; github?: GitHubClient; llm?: MockLLMProvider } = {},
  ) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: over.git ?? new MockGitClient({ head: HEAD, filesAtRef: FILES_AT_HEAD }),
        github: over.github ?? new MockGitHubClient(),
        intent: new MockPrIntent(),
        llm: { openai: over.llm ?? new MockLLMProvider('openai') },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  // Attachments are counted workspace-wide (`used_by`), so every test removes
  // the agents and skills it created; the FK cascade clears their rows.
  afterEach(async () => {
    const app = await makeApp();
    for (const id of agentIds.splice(0)) await app.inject({ method: 'DELETE', url: `/agents/${id}` });
    for (const id of skillIds.splice(0)) await app.inject({ method: 'DELETE', url: `/skills/${id}` });
  });

  async function makeRepo(opts: { cloned?: boolean } = {}) {
    const name = `ctx-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: opts.cloned === false ? null : `/mock/clones/acme/${name}`,
      })
      .returning();
    return repo!;
  }

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `ctx-agent-${Math.random().toString(36).slice(2, 8)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(res.statusCode).toBe(201);
    const agent = res.json() as { id: string };
    agentIds.push(agent.id);
    return agent;
  }

  async function makeSkill(app: App, name = `ctx-skill-${Math.random().toString(36).slice(2, 8)}`) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'ctx skill', type: 'custom', body: '# Rule\n\nOriginal.' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json() as { id: string; name: string };
    skillIds.push(skill.id);
    return skill;
  }

  const put = (app: App, owner: 'agents' | 'skills', id: string, items: Item[]) =>
    app.inject({ method: 'PUT', url: `/${owner}/${id}/context`, payload: { items } });
  const get = (app: App, owner: 'agents' | 'skills', id: string) =>
    app.inject({ method: 'GET', url: `/${owner}/${id}/context` });

  // ---- the doc list -------------------------------------------------------

  it('lists only .md files under the configured folders, path ascending, with source and tokens', async () => {
    const app = await makeApp();
    const repo = await makeRepo();

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const docs = res.json() as {
      path: string;
      source: string;
      size: number;
      tokens: number;
      content: string | null;
    }[];

    expect(docs.map((x) => x.path)).toEqual(['docs/a.md', 'specs/b.md', 'x/docs/c.md']);

    const b = docs.find((x) => x.path === 'specs/b.md')!;
    expect(b).toMatchObject({ tokens: 3, size: 10, source: 'specs' });
    expect(b.content ?? null).toBeNull();

    // `source` is the configured folder name, wherever it sits in the path.
    expect(docs.find((x) => x.path === 'x/docs/c.md')!.source).toBe('docs');
  });

  it('GET /repos/:id/context/file returns the content, tokens, source and used_by', async () => {
    const app = await makeApp();
    const repo = await makeRepo();

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=${encodeURIComponent('specs/b.md')}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      path: 'specs/b.md',
      content: '0123456789',
      tokens: 3,
      source: 'specs',
      used_by: 0,
    });
  });

  it('GET /context/sources returns the configured folder names', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/context/sources' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ folders: ['docs', 'specs'] });
  });

  // ---- agent attachments --------------------------------------------------

  it('PUT then GET returns positioned items first, by position, then the unpositioned by path', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);

    const saved = await put(app, 'agents', agent.id, [
      { path: 'specs/a.md', position: 1 },
      { path: 'specs/b.md', position: null },
      { path: 'specs/c.md', position: 0 },
    ]);
    expect(saved.statusCode).toBe(200);

    const read = await get(app, 'agents', agent.id);
    expect(read.statusCode).toBe(200);
    expect(read.json().items).toEqual([
      { path: 'specs/c.md', position: 0 },
      { path: 'specs/a.md', position: 1 },
      { path: 'specs/b.md', position: null },
    ]);
  });

  it('collapses a repeated path (the first one wins) before it stores anything', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);

    const saved = await put(app, 'agents', agent.id, [
      { path: 'specs/a.md', position: null },
      { path: 'specs/b.md', position: 0 },
      { path: 'specs/a.md', position: 1 },
    ]);
    expect(saved.statusCode).toBe(200);

    const read = await get(app, 'agents', agent.id);
    expect(read.json().items).toEqual([
      { path: 'specs/b.md', position: 0 },
      { path: 'specs/a.md', position: null },
    ]);
  });

  it('renumbers positions with gaps to 0..n-1', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);

    const saved = await put(app, 'agents', agent.id, [
      { path: 'specs/a.md', position: 2 },
      { path: 'specs/b.md', position: 7 },
    ]);
    expect(saved.statusCode).toBe(200);

    const read = await get(app, 'agents', agent.id);
    expect(read.json().items).toEqual([
      { path: 'specs/a.md', position: 0 },
      { path: 'specs/b.md', position: 1 },
    ]);
  });

  it('leaves the agent version and its version history untouched', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);

    // Give the history more than one entry so "unchanged" is not trivially 1.
    const edited = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { system_prompt: 'You are a stricter reviewer.' },
    });
    expect(edited.statusCode).toBe(200);

    const before = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json() as { version: number };
    const historyBefore = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json() as unknown[];

    const saved = await put(app, 'agents', agent.id, [{ path: 'specs/a.md', position: 0 }]);
    expect(saved.statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json() as { version: number };
    const historyAfter = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json() as unknown[];
    expect(after.version).toBe(before.version);
    expect(historyAfter).toHaveLength(historyBefore.length);
  });

  // ---- skill attachments --------------------------------------------------

  it('a skill keeps what was PUT: the GET returns the same body', async () => {
    const app = await makeApp();
    const skill = await makeSkill(app);
    const body = { items: [{ path: 'docs/s.md', position: null }] };

    const saved = await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context`, payload: body });
    expect(saved.statusCode).toBe(200);

    const read = await get(app, 'skills', skill.id);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(body);
  });

  it('leaves the skill version and its version history untouched', async () => {
    const app = await makeApp();
    const skill = await makeSkill(app);

    // A body change versions a skill: start with two history entries.
    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# Rule\n\nEdited body.' },
    });
    expect(edited.statusCode).toBe(200);

    const before = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json() as { version: number };
    const historyBefore = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json() as unknown[];

    const saved = await put(app, 'skills', skill.id, [{ path: 'docs/s.md', position: 0 }]);
    expect(saved.statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json() as { version: number };
    const historyAfter = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json() as unknown[];
    expect(after.version).toBe(before.version);
    expect(historyAfter).toHaveLength(historyBefore.length);
  });

  // ---- inheritance --------------------------------------------------------

  it("an agent's context lists the docs of its enabled, linked skills under `inherited`", async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app, `inherit-${Math.random().toString(36).slice(2, 8)}`);

    expect((await put(app, 'skills', skill.id, [{ path: 'docs/s.md', position: null }])).statusCode).toBe(200);
    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skill.id, enabled: true }] },
    });
    expect(linked.statusCode).toBe(200);

    const read = await get(app, 'agents', agent.id);
    expect(read.statusCode).toBe(200);
    expect(read.json().inherited).toEqual([
      {
        skill_id: skill.id,
        skill_name: skill.name,
        items: [{ path: 'docs/s.md', position: null }],
      },
    ]);
  });

  // ======================= T2: edges and unwanted behaviour =======================

  const MISSING_ID = '00000000-0000-4000-8000-000000000000';
  const message = (res: { json: () => unknown }) => (res.json() as { error: { message: string } }).error.message;

  async function link(app: App, agentId: string, skills: { skill_id: string; enabled: boolean }[]) {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skills } });
    expect(res.statusCode).toBe(200);
  }

  // ---- the list cache (R-36) ----

  it('reads no file on a second list call at the same HEAD, and re-reads after HEAD moves', async () => {
    const filesAtRef: Record<string, string> = { ...FILES_AT_HEAD };
    const git = new MockGitClient({ head: HEAD, syncedHead: 'b2c3d4e5', filesAtRef });
    const app = await makeApp({ git });
    const repo = await makeRepo();
    const url = `/repos/${repo.id}/context`;

    const first = await app.inject({ method: 'GET', url });
    expect(first.statusCode).toBe(200);
    const reads = git.readsAtRef.length;
    expect(reads).toBeGreaterThan(0);

    const second = await app.inject({ method: 'GET', url });
    expect(second.json()).toEqual(first.json());
    expect(git.readsAtRef.length).toBe(reads);

    filesAtRef['b2c3d4e5:docs/new.md'] = 'n';
    await git.sync({ owner: 'acme', name: repo.name }, 'main');
    const third = await app.inject({ method: 'GET', url });
    expect((third.json() as { path: string }[]).map((d) => d.path)).toEqual(['docs/new.md']);
    expect(git.readsAtRef.length).toBeGreaterThan(reads);
  });

  // ---- list / file errors (AC-7, AC-10) ----

  it('422 "not cloned yet" for a repo without a clone; 404 for an unknown repo; 422 for a non-uuid', async () => {
    const app = await makeApp();
    const repo = await makeRepo({ cloned: false });

    const uncloned = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(uncloned.statusCode).toBe(422);
    expect(message(uncloned)).toBe('This repository has not been cloned yet.');

    const unknown = await app.inject({ method: 'GET', url: `/repos/${MISSING_ID}/context` });
    expect(unknown.statusCode).toBe(404);
    expect(message(unknown)).toBe('Repository not found');

    expect((await app.inject({ method: 'GET', url: '/repos/abc/context' })).statusCode).toBe(422);
  });

  it('the file route 404s a path that is not in the list, and never reads it', async () => {
    const git = new MockGitClient({ head: HEAD, filesAtRef: FILES_AT_HEAD });
    const app = await makeApp({ git });
    const repo = await makeRepo();
    const probes = ['../.env', 'src/a.ts', '/etc/x.md', 'specs/missing.md'];

    for (const p of probes) {
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(p)}`,
      });
      expect(res.statusCode, p).toBe(404);
    }
    const read = git.readsAtRef.map((r) => r.path);
    for (const p of probes) expect(read).not.toContain(p);

    const noPath = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/file` });
    expect(noPath.statusCode).toBe(422);
  });

  it('a doc over 200,000 bytes is listed with its size and tokens null, and has no content', async () => {
    const git = new MockGitClient({
      head: HEAD,
      filesAtRef: { [`${HEAD}:docs/big.md`]: 'a'.repeat(200_001) },
    });
    const app = await makeApp({ git });
    const repo = await makeRepo();

    const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    const big = (list.json() as { path: string; size: number; tokens: number | null }[]).find(
      (d) => d.path === 'docs/big.md',
    )!;
    expect(big.size).toBe(200_001);
    expect(big.tokens ?? null).toBeNull();

    const file = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=${encodeURIComponent('docs/big.md')}`,
    });
    expect(file.statusCode).toBe(200);
    expect(file.json().content ?? null).toBeNull();
    expect(file.json().tokens ?? null).toBeNull();
  });

  // ---- PUT validation (AC-21, AC-60) ----

  it('rejects an unsafe path with 422 and leaves the stored list unchanged', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const good = [{ path: 'specs/a.md', position: 0 }];
    expect((await put(app, 'agents', agent.id, good)).statusCode).toBe(200);

    for (const bad of ['/etc/a.md', 'a/../b.md', 'a.txt', '-x.md']) {
      const res = await put(app, 'agents', agent.id, [...good, { path: bad, position: null }]);
      expect(res.statusCode, bad).toBe(422);
    }
    expect((await get(app, 'agents', agent.id)).json().items).toEqual(good);
  });

  it('rejects a bad position with 422 and leaves the stored list unchanged; a repeated [a:0, a:0] is fine', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const good = [{ path: 'specs/a.md', position: 0 }];
    expect((await put(app, 'agents', agent.id, good)).statusCode).toBe(200);

    const bads: Item[][] = [
      [{ path: 'specs/b.md', position: -1 }],
      [{ path: 'specs/b.md', position: 1.5 }],
      [
        { path: 'specs/a.md', position: 0 },
        { path: 'specs/b.md', position: 0 },
      ],
    ];
    for (const bad of bads) expect((await put(app, 'agents', agent.id, bad)).statusCode).toBe(422);
    expect((await get(app, 'agents', agent.id)).json().items).toEqual(good);

    const repeated = await put(app, 'agents', agent.id, [
      { path: 'specs/a.md', position: 0 },
      { path: 'specs/a.md', position: 0 },
    ]);
    expect(repeated.statusCode).toBe(200);
    expect((await get(app, 'agents', agent.id)).json().items).toEqual([{ path: 'specs/a.md', position: 0 }]);
  });

  it('a skill PUT is validated the same way', async () => {
    const app = await makeApp();
    const skill = await makeSkill(app);
    expect((await put(app, 'skills', skill.id, [{ path: '/etc/a.md', position: null }])).statusCode).toBe(422);
    expect((await get(app, 'skills', skill.id)).json().items).toEqual([]);
  });

  it('404s an unknown agent or skill on GET and PUT', async () => {
    const app = await makeApp();
    const items = [{ path: 'specs/a.md', position: null }];

    for (const res of [
      await app.inject({ method: 'GET', url: `/agents/${MISSING_ID}/context` }),
      await app.inject({ method: 'PUT', url: `/agents/${MISSING_ID}/context`, payload: { items } }),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(message(res)).toBe('Agent not found');
    }
    for (const res of [
      await app.inject({ method: 'GET', url: `/skills/${MISSING_ID}/context` }),
      await app.inject({ method: 'PUT', url: `/skills/${MISSING_ID}/context`, payload: { items } }),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(message(res)).toBe('Skill not found');
    }
  });

  it("does not let one workspace read or write another workspace's agent", async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Math.random().toString(36).slice(2, 8)}` })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: other!.id,
        name: 'foreign',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'x',
      })
      .returning();

    expect((await get(app, 'agents', foreign!.id)).statusCode).toBe(404);
    expect((await put(app, 'agents', foreign!.id, [{ path: 'specs/a.md', position: null }])).statusCode).toBe(404);
  });

  // ---- inheritance and used_by (A-5, A-17) ----

  it('a muted link, or a globally disabled skill, contributes nothing to `inherited`', async () => {
    const app = await makeApp();
    const muted = await makeAgent(app);
    const disabled = await makeAgent(app);
    const skillA = await makeSkill(app);
    const skillB = await makeSkill(app);
    await put(app, 'skills', skillA.id, [{ path: 'docs/s.md', position: null }]);
    await put(app, 'skills', skillB.id, [{ path: 'docs/s.md', position: null }]);

    await link(app, muted.id, [{ skill_id: skillA.id, enabled: false }]);
    await link(app, disabled.id, [{ skill_id: skillB.id, enabled: true }]);
    expect((await app.inject({ method: 'PUT', url: `/skills/${skillB.id}`, payload: { enabled: false } })).statusCode).toBe(200);

    expect((await get(app, 'agents', muted.id)).json().inherited).toEqual([]);
    expect((await get(app, 'agents', disabled.id)).json().inherited).toEqual([]);
  });

  it('used_by counts agents that attach a doc directly or through an enabled link, not a muted one', async () => {
    const git = new MockGitClient({ head: HEAD, filesAtRef: { [`${HEAD}:docs/u.md`]: 'u' } });
    const app = await makeApp({ git });
    const repo = await makeRepo();
    const a1 = await makeAgent(app);
    const a2 = await makeAgent(app);
    const a3 = await makeAgent(app);
    const skill = await makeSkill(app);

    await put(app, 'agents', a1.id, [{ path: 'docs/u.md', position: null }]);
    await put(app, 'skills', skill.id, [{ path: 'docs/u.md', position: null }]);
    await link(app, a2.id, [{ skill_id: skill.id, enabled: true }]);
    await link(app, a3.id, [{ skill_id: skill.id, enabled: false }]);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=${encodeURIComponent('docs/u.md')}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().used_by).toBe(2);
  });

  // ---- no LLM, no GitHub (NFR-1, NFR-2) ----

  it('the list, file and PUT routes make no LLM call and no GitHub call', async () => {
    const llm = new MockLLMProvider('openai');
    const github = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'then'
            ? undefined
            : () => {
                throw new Error(`GitHub must not be called (${String(prop)})`);
              },
      },
    ) as unknown as GitHubClient;
    const app = await makeApp({ llm, github });
    const repo = await makeRepo();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app);

    const responses = [
      await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` }),
      await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/context/file?path=${encodeURIComponent('specs/b.md')}`,
      }),
      await put(app, 'agents', agent.id, [{ path: 'specs/a.md', position: 0 }]),
      await put(app, 'skills', skill.id, [{ path: 'docs/s.md', position: null }]),
    ];
    for (const res of responses) expect(res.statusCode).toBeLessThan(300);
    expect(llm.calls).toHaveLength(0);
  });

  // ---- DB guarantees (R-38, R-33) ----

  const failure = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { code?: string; cause?: { code?: string } }) => e,
    );
  const sqlState = (e: { code?: string; cause?: { code?: string } } | null) => e?.cause?.code ?? e?.code;

  it('the database refuses two rows with the same non-null position per owner, but allows many NULLs', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app);
    const db = pg.handle.db;

    await db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'specs/a.md', position: 0 });
    const dupAgent = await failure(
      db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'specs/b.md', position: 0 }),
    );
    expect(sqlState(dupAgent)).toBe('23505');
    await db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'specs/c.md', position: null });
    await db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'specs/d.md', position: null });

    await db.insert(t.skillContextDocs).values({ skillId: skill.id, path: 'specs/a.md', position: 0 });
    const dupSkill = await failure(
      db.insert(t.skillContextDocs).values({ skillId: skill.id, path: 'specs/b.md', position: 0 }),
    );
    expect(sqlState(dupSkill)).toBe('23505');
    await db.insert(t.skillContextDocs).values({ skillId: skill.id, path: 'specs/c.md', position: null });
    await db.insert(t.skillContextDocs).values({ skillId: skill.id, path: 'specs/d.md', position: null });
  });

  it('the database refuses a negative position', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const err = await failure(
      pg.handle.db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'specs/a.md', position: -1 }),
    );
    expect(sqlState(err)).toBe('23514');
  });

  it("deleting an agent or a skill removes its attachments", async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const skill = await makeSkill(app);
    await put(app, 'agents', agent.id, [{ path: 'specs/a.md', position: 0 }]);
    await put(app, 'skills', skill.id, [{ path: 'docs/s.md', position: null }]);

    const db = pg.handle.db;
    expect(await db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agent.id))).toHaveLength(1);
    expect(await db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skill.id))).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);

    expect(await db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agent.id))).toHaveLength(0);
    expect(await db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skill.id))).toHaveLength(0);
  });
});
