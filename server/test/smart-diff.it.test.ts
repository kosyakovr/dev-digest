/**
 * GET /pulls/:id/smart-diff — PR files grouped by role + the finding lines of
 * the "latest review set" (server/specs/L03-smart-diff.md, gates G1/G2/G3).
 *
 * Oracles come from the approved plan: the newest `agent_runs` batch (every run
 * sharing the newest `ran_at`) → its `kind='review'` reviews; no batch reviews →
 * the single newest review; none → []. Dismissed findings are excluded.
 * Gated on Docker, like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockPrIntent } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

let repoSeq = 0;
async function setupPr(db: Db, workspaceId: string, files: Array<[string, number, number]>) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Smart diff fixture',
      author: 'marisa.koch',
      branch: 'feat/sd',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 0,
      deletions: 0,
      filesCount: files.length,
      status: 'needs_review',
    })
    .returning();
  if (files.length > 0) {
    await db
      .insert(t.prFiles)
      .values(files.map(([path, additions, deletions]) => ({ prId: pr!.id, path, additions, deletions })));
  }
  return pr!;
}

async function addReview(
  db: Db,
  workspaceId: string,
  prId: string,
  opts: { runId?: string; createdAt: Date; kind?: 'review' | 'summary' },
) {
  const [r] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      runId: opts.runId ?? null,
      kind: opts.kind ?? 'review',
      verdict: 'request_changes',
      score: 50,
      createdAt: opts.createdAt,
    })
    .returning();
  return r!;
}

interface F {
  file: string;
  line: number;
  severity?: string;
  dismissed?: boolean;
  accepted?: boolean;
}
async function addFindings(db: Db, reviewId: string, list: F[]) {
  await db.insert(t.findings).values(
    list.map((f) => ({
      reviewId,
      file: f.file,
      startLine: f.line,
      endLine: f.line,
      severity: f.severity ?? 'WARNING',
      category: 'bug',
      title: `finding ${f.file}:${f.line}`,
      rationale: 'because',
      confidence: 0.9,
      dismissedAt: f.dismissed ? new Date('2026-09-05T00:00:00Z') : null,
      acceptedAt: f.accepted ? new Date('2026-09-05T00:00:00Z') : null,
    })),
  );
}

const T0 = new Date('2026-09-01T00:00:00Z');
const T1 = new Date('2026-09-02T00:00:00Z');
const T2 = new Date('2026-09-03T00:00:00Z');

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        intent: new MockPrIntent(),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const get = async (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });

  it('groups files by role in display order and takes finding lines from the newest batch only', async () => {
    const db = pg.handle.db;
    const pr = await setupPr(db, workspaceId, [
      ['src/a.ts', 10, 2],
      ['src/a.test.ts', 5, 0],
      ['README.md', 1, 1],
      ['pnpm-lock.yaml', 100, 50],
    ]);
    // Old run T1 with review R0 — superseded by the batch at T2.
    const [oldRun, runA, runB] = await db
      .insert(t.agentRuns)
      .values([
        { workspaceId, prId: pr.id, ranAt: T1, status: 'done' },
        { workspaceId, prId: pr.id, ranAt: T2, status: 'done' },
        { workspaceId, prId: pr.id, ranAt: T2, status: 'done' },
      ])
      .returning();
    const r0 = await addReview(db, workspaceId, pr.id, { runId: oldRun!.id, createdAt: T1 });
    const ra = await addReview(db, workspaceId, pr.id, { runId: runA!.id, createdAt: T2 });
    const rb = await addReview(db, workspaceId, pr.id, { runId: runB!.id, createdAt: T2 });
    // A kind='summary' row of the newest batch must not contribute lines.
    const summary = await addReview(db, workspaceId, pr.id, {
      runId: runA!.id,
      createdAt: T2,
      kind: 'summary',
    });

    await addFindings(db, r0.id, [{ file: 'src/a.ts', line: 99 }]);
    await addFindings(db, ra.id, [
      { file: 'src/a.ts', line: 12, severity: 'CRITICAL' },
      { file: 'src/a.ts', line: 12, severity: 'WARNING' }, // same line twice → one entry
      { file: 'src/a.ts', line: 30, accepted: true }, // accepted findings stay (G2)
    ]);
    await addFindings(db, rb.id, [
      { file: 'src/a.test.ts', line: 5, dismissed: true }, // dismissed → excluded (G2)
      { file: 'src/renamed-old.ts', line: 3 }, // not a PR path → dropped
    ]);
    await addFindings(db, summary.id, [{ file: 'src/a.ts', line: 77 }]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'tests',
      'docs',
      'boilerplate',
    ]);
    const byRole = Object.fromEntries(body.groups.map((g: { role: string }) => [g.role, g.files]));
    expect(byRole.core).toEqual([{ path: 'src/a.ts', additions: 10, deletions: 2, finding_lines: [12, 30] }]);
    expect(byRole.tests).toEqual([{ path: 'src/a.test.ts', additions: 5, deletions: 0, finding_lines: [] }]);
    expect(byRole.docs).toEqual([{ path: 'README.md', additions: 1, deletions: 1, finding_lines: [] }]);
    expect(byRole.boilerplate).toEqual([
      { path: 'pnpm-lock.yaml', additions: 100, deletions: 50, finding_lines: [] },
    ]);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 169, proposed_splits: [] });
    expect(new Set(body.review_ids)).toEqual(new Set([ra.id, rb.id]));
    expect(body.review_ids).toHaveLength(2);
    expect(body.review_ids).not.toContain(r0.id);
    expect(body.review_ids).not.toContain(summary.id);
    // The wire shape is the contract.
    expect(() => SmartDiffResponse.parse(body)).not.toThrow();
  });

  it('a PR without agent_runs falls back to the single newest review', async () => {
    const db = pg.handle.db;
    const pr = await setupPr(db, workspaceId, [['src/a.ts', 3, 1]]);
    const r1 = await addReview(db, workspaceId, pr.id, { createdAt: T0 });
    const r2 = await addReview(db, workspaceId, pr.id, { createdAt: T1 });
    await addFindings(db, r1.id, [{ file: 'src/a.ts', line: 1 }]);
    await addFindings(db, r2.id, [{ file: 'src/a.ts', line: 2 }]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review_ids).toEqual([r2.id]);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].files[0].finding_lines).toEqual([2]);
  });

  it('a newest batch that produced no review falls back to the older review', async () => {
    const db = pg.handle.db;
    const pr = await setupPr(db, workspaceId, [['src/a.ts', 3, 1]]);
    const [oldRun] = await db
      .insert(t.agentRuns)
      .values([
        { workspaceId, prId: pr.id, ranAt: T0, status: 'done' },
        { workspaceId, prId: pr.id, ranAt: T2, status: 'failed' }, // newest batch: no review
      ])
      .returning();
    const r1 = await addReview(db, workspaceId, pr.id, { runId: oldRun!.id, createdAt: T0 });
    await addFindings(db, r1.id, [{ file: 'src/a.ts', line: 4 }]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review_ids).toEqual([r1.id]);
    expect(body.groups[0].files[0].finding_lines).toEqual([4]);
  });

  it('a PR without reviews: 200, review_ids [] and no finding lines', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId, [
      ['src/a.ts', 3, 1],
      ['README.md', 1, 0],
    ]);
    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review_ids).toEqual([]);
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual(['core', 'docs']);
    const lines = body.groups.flatMap((g: { files: { finding_lines: number[] }[] }) =>
      g.files.map((f) => f.finding_lines),
    );
    expect(lines).toEqual([[], []]);
  });

  it('unknown uuid → 404, non-uuid → 422, a PR of another workspace → 404', async () => {
    const db = pg.handle.db;
    const unknown = await get('00000000-0000-4000-8000-000000000000');
    expect(unknown.statusCode).toBe(404);

    const bad = await get('not-a-uuid');
    expect(bad.statusCode).toBe(422);

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'smart-diff-other' }).returning();
    const foreign = await setupPr(db, otherWs!.id, [['src/a.ts', 1, 0]]);
    const res = await get(foreign.id);
    expect(res.statusCode).toBe(404);
  });
});
