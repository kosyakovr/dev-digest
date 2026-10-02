import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';

/**
 * pr-self-review B-1 (stable commit order) and B-2 (the DB enforces the
 * confidence enum: migration 0014) on a real Postgres.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('pr_commits order and pr_intent.confidence (pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: ReviewRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    repo = new ReviewRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr() {
    const name = `pr-intent-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: r!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'h1',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  const commit = (prId: string, sha: string, committedAt: Date | null) => ({
    prId,
    sha,
    message: `msg ${sha}`,
    author: 'a',
    committedAt,
  });

  describe('getPrCommits order (B-1)', () => {
    it('same committedAt -> sorted by sha, whatever the insert order', async () => {
      const pr = await newPr();
      const at = new Date('2026-09-01T10:00:00Z');
      await pg.handle.db
        .insert(t.prCommits)
        .values(['ccc', 'aaa', 'eee', 'bbb', 'ddd'].map((sha) => commit(pr.id, sha, at)));
      const got = await repo.getPrCommits(workspaceId, pr.id);
      expect(got.map((c) => c.sha)).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee']);
    });

    it('null committedAt on every row -> sorted by sha', async () => {
      const pr = await newPr();
      await pg.handle.db
        .insert(t.prCommits)
        .values(['zz9', 'aa1', 'mm5'].map((sha) => commit(pr.id, sha, null)));
      const got = await repo.getPrCommits(workspaceId, pr.id);
      expect(got.map((c) => c.sha)).toEqual(['aa1', 'mm5', 'zz9']);
    });

    it('committedAt still comes first: an older commit with a later sha is listed first', async () => {
      const pr = await newPr();
      await pg.handle.db.insert(t.prCommits).values([
        commit(pr.id, 'aaa', new Date('2026-09-02T00:00:00Z')),
        commit(pr.id, 'zzz', new Date('2026-09-01T00:00:00Z')),
      ]);
      const got = await repo.getPrCommits(workspaceId, pr.id);
      expect(got.map((c) => c.sha)).toEqual(['zzz', 'aaa']);
    });
  });

  describe('pr_intent.confidence CHECK (B-2)', () => {
    const row = (prId: string, confidence: string) => ({
      prId,
      intent: 'Add rate limiting',
      inScope: ['api'],
      outOfScope: [],
      confidence: confidence as 'high',
      sources: [],
      headSha: 'h1',
      inputHash: 'abc',
      provider: 'openrouter',
      model: 'm',
      tokensIn: 1,
      tokensOut: 1,
      costUsd: null,
      derivedAt: new Date('2026-09-01T00:00:00Z'),
    });

    for (const level of ['high', 'medium', 'low']) {
      it(`accepts "${level}"`, async () => {
        const pr = await newPr();
        await repo.upsertIntent(row(pr.id, level));
        expect((await repo.getIntent(workspaceId, pr.id))!.confidence).toBe(level);
      });
    }

    it('rejects "bogus" and stores nothing', async () => {
      const pr = await newPr();
      await expect(repo.upsertIntent(row(pr.id, 'bogus'))).rejects.toThrow(/pr_intent_confidence_check/);
      expect(await repo.getIntent(workspaceId, pr.id)).toBeUndefined();
    });

    it('rejects an update of an existing row to "bogus" and keeps the old value', async () => {
      const pr = await newPr();
      await repo.upsertIntent(row(pr.id, 'high'));
      await expect(repo.upsertIntent(row(pr.id, 'bogus'))).rejects.toThrow();
      expect((await repo.getIntent(workspaceId, pr.id))!.confidence).toBe('high');
    });
  });
});
