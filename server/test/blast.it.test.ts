import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadius } from '@devdigest/shared';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * GET /pulls/:id/blast — route over a real Postgres index
 * (plan blast-plan-v2 AC-1, AC-3, AC-5, AC-7, AC-8; Test brief WP4.tests).
 * Gated on Docker; self-skips without it.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

type Printed = Record<string, unknown>;

/** Collect what pino writes to fd 1 (server/INSIGHTS.md 2026-10-01: spy fs.write / fs.writeSync). */
function interceptStdout() {
  const printed: Printed[] = [];
  const take = (data: unknown): number => {
    const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
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

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  /** `production` only where the log line is asserted: pino then writes straight to fd 1. */
  const cfg = (production: boolean) =>
    production
      ? loadConfig({ NODE_ENV: 'production', LOG_LEVEL: 'info' })
      : loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  function appWith(repoIntel?: RepoIntel, production = false) {
    return buildApp({
      config: cfg(production),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        ...(repoIntel ? { repoIntel } : {}),
      },
    });
  }

  /** A repo + PR changing `files`; optionally an indexed graph around `src/a.ts`. */
  async function setupPr(
    opts: {
      ws?: string;
      files?: string[];
      index?: { status: 'full' | 'partial' | 'failed'; sha: string } | null;
      graph?: boolean;
    } = {},
  ) {
    const db = pg.handle.db;
    const ws = opts.ws ?? workspaceId;
    const name = `blast-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const repoId = repo!.id;
    const files = opts.files ?? ['src/a.ts'];
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId,
        number: 7,
        title: 'Blast fixture',
        author: 'marisa.koch',
        branch: 'feat/b',
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
    const index = opts.index === undefined ? { status: 'full' as const, sha: 'deadbeef' } : opts.index;
    if (index) {
      await db.insert(t.repoIndexState).values({
        repoId,
        lastIndexedSha: index.sha,
        indexerVersion: 2,
        status: index.status,
        filesIndexed: 3,
      });
    }
    if (opts.graph !== false && index && index.status !== 'failed') {
      await db.insert(t.symbols).values([
        { repoId, path: 'src/a.ts', name: 'A', kind: 'function', line: 1, endLine: 9 },
        { repoId, path: 'src/h.ts', name: 'handler', kind: 'function', line: 1, endLine: 9 },
        { repoId, path: 'src/r.ts', name: 'route', kind: 'function', line: 1, endLine: 9 },
      ]);
      await db.insert(t.references).values([
        { repoId, fromPath: 'src/h.ts', toSymbol: 'A', line: 5, declFile: 'src/a.ts' },
        { repoId, fromPath: 'src/r.ts', toSymbol: 'handler', line: 4, declFile: 'src/h.ts' },
      ]);
      await db.insert(t.fileRank).values(
        ['src/h.ts', 'src/r.ts'].map((filePath) => ({
          repoId,
          filePath,
          pagerank: 0.5,
          hotness: 0,
          rank: 0.5,
          percentile: 50,
        })),
      );
      await db.insert(t.fileFacts).values([
        { repoId, filePath: 'src/h.ts', endpoints: ['GET /x'], crons: [] },
        { repoId, filePath: 'src/r.ts', endpoints: [], crons: ['nightly'] },
      ]);
    }
    return pr!;
  }

  it('AC-1/AC-8: serves the indexed blast radius with indexed_sha, endpoints and a non-degraded flag', async () => {
    const app = await appWith();
    const pr = await setupPr();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => BlastRadius.parse(body)).not.toThrow();
    expect(body.indexed_sha).toBe('deadbeef');
    expect(body.degraded).toBe(false);
    expect(body.reason).toBeUndefined();
    expect(body.changed_symbols).toEqual([{ name: 'A', file: 'src/a.ts', kind: 'function' }]);
    const group = body.downstream.find((g: { symbol: string }) => g.symbol === 'A');
    expect(group.endpoints_affected).toContain('GET /x');
    expect(group.callers[0]).toMatchObject({ name: 'handler', file: 'src/h.ts', line: 5, depth: 1 });
    await app.close();
  });

  it('AC-5: a caller of a caller shows up at depth 2 through the depth-1 name, with its cron', async () => {
    const app = await appWith();
    const pr = await setupPr();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    const group = res.json().downstream.find((g: { symbol: string }) => g.symbol === 'A');
    expect(group.callers).toContainEqual(
      expect.objectContaining({ name: 'route', file: 'src/r.ts', line: 4, depth: 2, through: 'handler' }),
    );
    expect(group.crons_affected).toEqual(['nightly']);
    await app.close();
  });

  it('AC-3: a partial index is served with degraded:true / index_partial', async () => {
    const app = await appWith();
    const pr = await setupPr({ index: { status: 'partial', sha: 'p1' } });
    const body = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` })).json();
    expect(body).toMatchObject({ degraded: true, reason: 'index_partial', indexed_sha: 'p1' });
    expect(body.downstream.length).toBeGreaterThan(0);
    await app.close();
  });

  it('AC-3: no index row → no_data; failed index → index_failed with empty downstream', async () => {
    const app = await appWith();
    const none = await setupPr({ index: null });
    const noneBody = (await app.inject({ method: 'GET', url: `/pulls/${none.id}/blast` })).json();
    expect(noneBody).toMatchObject({ degraded: true, reason: 'no_data', downstream: [] });
    expect(noneBody.indexed_sha).toBeUndefined();

    const failed = await setupPr({ index: { status: 'failed', sha: 'f1' } });
    const failedBody = (await app.inject({ method: 'GET', url: `/pulls/${failed.id}/blast` })).json();
    expect(failedBody).toMatchObject({
      degraded: true,
      reason: 'index_failed',
      downstream: [],
      indexed_sha: 'f1',
    });
    await app.close();
  });

  it('AC-1: unknown uuid → 404, a PR of another workspace → 404, non-uuid → 422', async () => {
    const app = await appWith();
    const unknown = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/blast' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.message).toBe('Pull request not found');

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'blast-other' }).returning();
    const foreign = await setupPr({ ws: otherWs!.id });
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/blast` })).statusCode).toBe(404);

    expect((await app.inject({ method: 'GET', url: '/pulls/abc/blast' })).statusCode).toBe(422);
    await app.close();
  });

  it('passes a degraded facade result through the mapper unchanged', async () => {
    const fake: Partial<RepoIntel> = {
      getBlastRadius: async () => ({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'index_failed',
        source: 'none',
      }),
    };
    const app = await appWith(fake as RepoIntel);
    const pr = await setupPr({ index: null });
    const body = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` })).json();
    expect(body).toMatchObject({ degraded: true, reason: 'index_failed', downstream: [], changed_symbols: [] });
    await app.close();
  });

  it('AC-7: one request logs exactly one "blast: computed" line carrying the request id and the counters', async () => {
    stdout = interceptStdout();
    const app = await appWith(undefined, true);
    const pr = await setupPr();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    await stdout.until((l) => l.msg === 'request completed');
    const lines = stdout.printed.filter((l) => l.msg === 'blast: computed');
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.correlationId).toBe(line.reqId);
    expect(line.source).toBe('index');
    expect(line.degraded).toBe(false);
    expect(line.indexedSha).toBe('deadbeef');
    expect(line).toMatchObject({ symbols: 1, callers: 2, endpoints: 1, crons: 1 });
    expect(typeof line.ms).toBe('number');
    await app.close();
  });
});
