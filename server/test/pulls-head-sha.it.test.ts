import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * GET /pulls/:id also stores GitHub's head SHA (plan docs/plans/L05-risk-brief.md,
 * Test brief WP4.tests [T1]; spec AC-52, AC-53). Gated on Docker; self-skips without it.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const OLD_HEAD = 'old1111';
const NEW_HEAD = 'new2222';

d('GET /pulls/:id stores head_sha (Testcontainers pg)', () => {
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

  function appWith(github: MockGitHubClient) {
    return buildApp({
      config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github,
      },
    });
  }

  async function setupPr(opts: { intent?: boolean } = {}) {
    const db = pg.handle.db;
    const name = `head-sha-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 9,
        title: 'Head sha fixture',
        author: 'marisa.koch',
        branch: 'feat/h',
        base: 'main',
        headSha: OLD_HEAD,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    if (opts.intent) {
      await db.insert(t.prIntent).values({
        prId: pr!.id,
        intent: 'Derived at the old head',
        inScope: [],
        outOfScope: [],
        confidence: 'medium',
        sources: [],
        headSha: OLD_HEAD,
        inputHash: 'h',
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

  const storedHead = async (prId: string) =>
    (await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId)))[0]!.headSha;

  it("AC-52: a refresh from GitHub writes GitHub's head SHA to pull_requests.head_sha", async () => {
    const app = await appWith(new MockGitHubClient({ detail: { head_sha: NEW_HEAD } }));
    const pr = await setupPr();
    expect(await storedHead(pr.id)).toBe(OLD_HEAD);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(await storedHead(pr.id)).toBe(NEW_HEAD);
  });

  it('AC-53: an intent derived at the old head reports stale:true after the refresh', async () => {
    const app = await appWith(new MockGitHubClient({ detail: { head_sha: NEW_HEAD } }));
    const pr = await setupPr({ intent: true });

    // Control: before the refresh the intent matches the stored head.
    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(before.statusCode).toBe(200);
    expect(before.json().intent.stale).toBe(false);

    const detail = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    await app.close();

    expect(after.statusCode).toBe(200);
    expect(after.json().intent.stale).toBe(true);
  });

  it('AC-54: with GitHub unreachable the stored detail is served and head_sha keeps its value', async () => {
    class OfflineGitHub extends MockGitHubClient {
      override async getPullRequest(): Promise<never> {
        throw new Error('offline');
      }
    }
    const app = await appWith(new OfflineGitHub());
    const pr = await setupPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().head_sha).toBe(OLD_HEAD);
    expect(await storedHead(pr.id)).toBe(OLD_HEAD);
  });
});
