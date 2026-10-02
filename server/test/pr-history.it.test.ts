import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
  type MockGitHubOptions,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { PrHistory } from '@devdigest/shared';

/**
 * GET /pulls/:id/history — prior merged PRs touching the PR's files, read from
 * GitHub `commits?path=` via the MockGitHubClient (plan blast-plan-v2 AC-9; Test
 * brief WP4.tests). Gated on Docker; self-skips without it.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const commit = (message: string, date?: string) => ({ sha: `sha-${message}`, message, date: date ?? null });
const summary = (n: number, merged: string | null, body: string | null = null) => ({
  number: n,
  title: `PR ${n}`,
  author: `user${n}`,
  body,
  merged_at: merged,
});

d('GET /pulls/:id/history (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** The rate limiter is not registered under NODE_ENV=test (src/app.ts), so one test opts out. */
  function appWith(github?: MockGitHubClient, nodeEnv: 'test' | 'development' = 'test') {
    return buildApp({
      config: loadConfig({ NODE_ENV: nodeEnv, LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        ...(github ? { github } : {}),
      },
    });
  }

  async function setupPr(files: string[], number = 50, defaultBranch = 'main') {
    const db = pg.handle.db;
    const name = `history-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, defaultBranch })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number,
        title: 'History fixture',
        author: 'marisa.koch',
        branch: 'feat/h',
        base: 'main',
        headSha: 'head1',
        additions: 1,
        deletions: 0,
        filesCount: files.length,
        status: 'needs_review',
      })
      .returning();
    if (files.length > 0) {
      await db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    }
    return pr!;
  }

  async function history(opts: MockGitHubOptions, files: string[]) {
    const gh = new MockGitHubClient(opts);
    const app = await appWith(gh);
    const pr = await setupPr(files);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    await app.close();
    return { res, gh, body: res.json() };
  }

  const mainScenario = (): MockGitHubOptions => ({
    commitsByPath: {
      'a.ts': [
        commit('X (#41)', '2026-03-01T00:00:00Z'),
        commit('Merge pull request #50 from acme/self', '2026-03-05T00:00:00Z'),
      ],
      'b.ts': [commit('Y (#33)', '2026-02-01T00:00:00Z'), commit('Z (#41)', '2026-02-20T00:00:00Z')],
    },
    pullSummaries: {
      41: summary(41, '2026-03-02T00:00:00Z', '## Why\nFixes the cache'),
      33: summary(33, '2026-02-02T00:00:00Z'),
    },
  });

  it('AC-9: lists prior merged PRs newest first, excludes the current PR, merges file overlap and notes', async () => {
    const { res, gh, body } = await history(mainScenario(), ['a.ts', 'b.ts']);
    expect(res.statusCode).toBe(200);
    expect(() => PrHistory.parse(body)).not.toThrow();
    expect(body.history.map((h: { pr_number: number }) => h.pr_number)).toEqual([41, 33]);
    expect(body.history[0].files_overlap).toEqual(['a.ts', 'b.ts']);
    expect(body.history[0].notes).toBe('Fixes the cache');
    expect(body.history[0]).toMatchObject({ title: 'PR 41', author: 'user41', merged_at: '2026-03-02T00:00:00Z' });
    expect(body.history[1].files_overlap).toEqual(['b.ts']);
    expect(gh.commitCalls.length).toBe(2);
    for (const c of gh.commitCalls) expect(c).toMatchObject({ ref: 'main', perPage: 30 });
    expect(body.degraded).toBeUndefined();
    expect(gh.summaryCalls).not.toContain(50);
  });

  it('skips PRs that were never merged', async () => {
    const opts = mainScenario();
    opts.pullSummaries![33] = summary(33, null);
    const { body } = await history(opts, ['a.ts', 'b.ts']);
    expect(body.history.map((h: { pr_number: number }) => h.pr_number)).toEqual([41]);
    expect(body.degraded).toBeUndefined();
  });

  it('a failed getPullSummary keeps the others and flags github_partial', async () => {
    const opts = mainScenario();
    opts.pullSummaries![33] = null;
    const { body } = await history(opts, ['a.ts', 'b.ts']);
    expect(body.history.map((h: { pr_number: number }) => h.pr_number)).toEqual([41]);
    expect(body).toMatchObject({ degraded: true, reason: 'github_partial' });
  });

  it('a failed listCommitsForPath keeps the other files and flags github_partial', async () => {
    const opts = mainScenario();
    opts.commitsByPath!['b.ts'] = null;
    const { body } = await history(opts, ['a.ts', 'b.ts']);
    expect(body.history.map((h: { pr_number: number }) => h.pr_number)).toEqual([41]);
    expect(body.history[0].files_overlap).toEqual(['a.ts']);
    expect(body).toMatchObject({ degraded: true, reason: 'github_partial' });
  });

  it('every listCommitsForPath failing → empty history with github_unavailable', async () => {
    const { res, body } = await history({ commitsByPath: { 'a.ts': null, 'b.ts': null } }, ['a.ts', 'b.ts']);
    expect(res.statusCode).toBe(200);
    expect(body).toEqual({ history: [], degraded: true, reason: 'github_unavailable' });
  });

  it('without a github override and without a token → github_unavailable', async () => {
    const app = await appWith();
    const pr = await setupPr(['a.ts']);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ history: [], degraded: true, reason: 'github_unavailable' });
    await app.close();
  });

  it('ceiling: 25 changed files → at most 20 listCommitsForPath calls', async () => {
    const files = Array.from({ length: 25 }, (_, i) => `f${String(i).padStart(2, '0')}.ts`);
    const { gh } = await history({}, files);
    expect(gh.commitCalls.length).toBe(20);
  });

  it('ceiling: 15 candidate PRs → 10 getPullSummary calls and at most 10 items', async () => {
    const commits = Array.from({ length: 15 }, (_, i) =>
      commit(`change ${i} (#${100 + i})`, `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    const { gh, body } = await history({ commitsByPath: { 'a.ts': commits } }, ['a.ts']);
    expect(gh.summaryCalls.length).toBe(10);
    expect(body.history.length).toBeLessThanOrEqual(10);
    // The ten newest by commit date are #114..#105.
    expect([...gh.summaryCalls].sort((a, b) => a - b)).toEqual([105, 106, 107, 108, 109, 110, 111, 112, 113, 114]);
  });

  it('a PR without files → empty history and no GitHub call', async () => {
    const { res, gh, body } = await history({}, []);
    expect(res.statusCode).toBe(200);
    expect(body).toEqual({ history: [] });
    expect(gh.commitCalls.length).toBe(0);
  });

  it('route rate limit: the 21st history request within a minute is refused with 429', async () => {
    const app = await appWith(new MockGitHubClient(), 'development');
    const pr = await setupPr([]);
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` })).statusCode);
    }
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
    await app.close();
  });

  it('unknown PR → 404, non-uuid → 422', async () => {
    const app = await appWith(new MockGitHubClient());
    expect((await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/history' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pulls/abc/history' })).statusCode).toBe(422);
    await app.close();
  });
});
