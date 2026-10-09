import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockPrIntent } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[run-trace-order] Docker not available — skipping integration tests.');
}

const CLEAN: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

/** Every LLM call fails: the per-agent catch path (failed run). */
class FailingLLM extends MockLLMProvider {
  override async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    throw new Error('boom: provider is down');
  }
}

/**
 * Plan AM-2 (3), approved 2026-10-06: the run executor persists the run trace
 * BEFORE it sets the terminal run status, so a `GET /runs/:id/trace` made as
 * soon as a run is terminal never 404s.
 *
 * The order is made observable without timing: a Postgres trigger records, at
 * the instant an `agent_runs` row first becomes done / failed / cancelled,
 * whether its `run_traces` row already exists. Nothing here depends on how fast
 * the background run is.
 */
d('the run trace is saved before the run turns terminal (AM-2)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const q = (s: string) => pg.handle.sql.unsafe(s);
    await q('CREATE TABLE ordering_probe (run_id uuid NOT NULL, status text NOT NULL, trace_existed boolean NOT NULL)');
    await q(`
      CREATE FUNCTION ordering_probe_fn() RETURNS trigger AS $$
      BEGIN
        IF NEW.status IN ('done', 'failed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO ordering_probe (run_id, status, trace_existed)
          VALUES (NEW.id, NEW.status, EXISTS (SELECT 1 FROM run_traces WHERE run_id = NEW.id));
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql`);
    await q(
      'CREATE TRIGGER ordering_probe_trg AFTER UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION ordering_probe_fn()',
    );
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: MockLLMProvider, git: MockGitClient = new MockGitClient()) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        intent: new MockPrIntent(),
        llm: { openai: llm },
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  async function setupPr() {
    const db = pg.handle.db;
    const name = `trace-order-${seq++}`;
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
        title: 'T',
        author: 'a',
        branch: 'f',
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

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Order-${seq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  /** Start one review; return its run id once the run row is terminal. */
  async function reviewToTerminal(app: App, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const { runs } = res.json() as { runs: { run_id: string }[] };
    const finished = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    return { runId: runs[0]!.run_id, status: finished[0]?.status };
  }

  /** What the probe saw when the run first became terminal. */
  async function probe(runId: string) {
    const rows = await pg.handle.sql<{ status: string; trace_existed: boolean }[]>`
      SELECT status, trace_existed FROM ordering_probe WHERE run_id = ${runId}`;
    return rows;
  }

  /** Let the background run finish writing, so the container is not torn down mid-write. */
  async function settle(runId: string) {
    for (let i = 0; i < 200; i++) {
      const rows = await pg.handle.sql`SELECT 1 FROM run_traces WHERE run_id = ${runId}`;
      if (rows.length > 0) return;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('a successful run: the trace row exists at the moment the status becomes done', async () => {
    const app = await appWith(new MockLLMProvider('openai', { structured: CLEAN }));
    const pr = await setupPr();
    const agent = await makeAgent(app);

    const { runId, status } = await reviewToTerminal(app, pr.id, agent.id);
    expect(status).toBe('done');

    const seen = await probe(runId);
    expect(seen).toEqual([{ status: 'done', trace_existed: true }]);
    await settle(runId);
  });

  it('a failed run (the per-agent catch path): the trace row exists at the moment the status becomes failed', async () => {
    const app = await appWith(new FailingLLM('openai'));
    const pr = await setupPr();
    const agent = await makeAgent(app);

    const { runId, status } = await reviewToTerminal(app, pr.id, agent.id);
    expect(status).toBe('failed');

    const seen = await probe(runId);
    expect(seen).toEqual([{ status: 'failed', trace_existed: true }]);
    await settle(runId);
  });

  it('a batch whose diff cannot be loaded (the failAll path): the trace exists when each run becomes failed', async () => {
    class NoDiffGit extends MockGitClient {
      override async diff(): Promise<never> {
        throw new Error('no clone');
      }
    }
    const app = await appWith(new MockLLMProvider('openai', { structured: CLEAN }), new NoDiffGit());
    const pr = await setupPr();
    const agent = await makeAgent(app);
    const q = (s: string) => pg.handle.sql.unsafe(s);

    // git cannot diff, so loadDiff falls back to pr_files; with that table unreadable the whole batch fails before any agent runs.
    await q('ALTER TABLE pr_files RENAME TO pr_files_hidden');
    let outcome: { runId: string; status: string | null | undefined };
    try {
      outcome = await reviewToTerminal(app, pr.id, agent.id);
    } finally {
      await q('ALTER TABLE pr_files_hidden RENAME TO pr_files');
    }
    expect(outcome.status).toBe('failed');

    const seen = await probe(outcome.runId);
    expect(seen).toEqual([{ status: 'failed', trace_existed: true }]);
    await settle(outcome.runId);
  });
});
