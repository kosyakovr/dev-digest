import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider, MockPrIntent } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-concurrency] Docker not available — skipping integration tests.');
}

type Item = { path: string; position: number | null };
type Owner = 'agents' | 'skills';

/**
 * Review finding B-1 / spec L05 AC-18, AC-19 (a save round-trips): two
 * concurrent `PUT /{agents,skills}/:id/context` for the SAME owner with
 * different valid bodies must both return 200, and a later GET must return
 * exactly one of the two bodies in full (last write wins) — never a 500 from a
 * unique violation, never a mix.
 *
 * The overlap is forced without timing. A trigger makes the first PUT block on
 * a Postgres advisory lock right after its INSERT, i.e. while its transaction
 * is open with the new rows written. The second PUT is issued while the first is
 * held there, then the lock is released. Whatever serialises the writers (a
 * parent-row lock, an advisory lock, a retry) works the same under this probe.
 */
d('project context — concurrent saves for one owner', () => {
  let pg: PgFixture;
  const HOLD_KEY = 7_005_001;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ head: 'a1b2c3d4', filesAtRef: {} }),
        github: new MockGitHubClient(),
        intent: new MockPrIntent(),
        llm: { openai: new MockLLMProvider('openai') },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeOwner(app: App, owner: Owner): Promise<string> {
    const name = `race-${Math.random().toString(36).slice(2, 8)}`;
    const res =
      owner === 'agents'
        ? await app.inject({
            method: 'POST',
            url: '/agents',
            payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a reviewer.' },
          })
        : await app.inject({
            method: 'POST',
            url: '/skills',
            payload: { name, description: 'race skill', type: 'custom', body: '# Rule\n\nOriginal.' },
          });
    expect(res.statusCode).toBe(201);
    return (res.json() as { id: string }).id;
  }

  const put = (app: App, owner: Owner, id: string, items: Item[]) =>
    app.inject({ method: 'PUT', url: `/${owner}/${id}/context`, payload: { items } });

  /** Poll `cond` until true or `ms` elapsed; returns whether it became true. */
  async function until(cond: () => Promise<boolean>, ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await cond()) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return cond();
  }

  const lockWaiters = async (event?: string): Promise<number> => {
    const rows = await pg.handle.sql.unsafe(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          ${event ? `AND wait_event = '${event}'` : ''}`,
    );
    return (rows[0] as { n: number }).n;
  };

  it.each<{ owner: Owner; table: string }>([
    { owner: 'agents', table: 'agent_context_docs' },
    { owner: 'skills', table: 'skill_context_docs' },
  ])(
    'two overlapping PUT /$owner/:id/context both succeed and the last write wins in full',
    async ({ owner, table }) => {
      const app = await makeApp();
      const id = await makeOwner(app, owner);

      // The stored set before either request: both PUTs replace it.
      const initial: Item[] = [
        { path: 'docs/old-x.md', position: 0 },
        { path: 'docs/old-y.md', position: 1 },
      ];
      expect((await put(app, owner, id, initial)).statusCode).toBe(200);

      // Two valid bodies that overlap on paths AND on positions, so any
      // un-serialised delete-then-insert collides on the PK or the position index.
      const bodyA: Item[] = [
        { path: 'specs/a.md', position: 0 },
        { path: 'specs/b.md', position: 1 },
        { path: 'specs/only-a.md', position: null },
      ];
      const bodyB: Item[] = [
        { path: 'specs/b.md', position: 0 },
        { path: 'specs/a.md', position: 1 },
        { path: 'specs/only-b.md', position: null },
      ];
      // What GET returns for each: positioned first by position, then the rest by path.
      const readA: Item[] = bodyA;
      const readB: Item[] = bodyB;

      const holder = postgres(pg.url, { max: 1 });
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        await holder`SELECT pg_advisory_unlock(${HOLD_KEY})`;
      };
      const sql = pg.handle.sql;
      try {
        await holder`SELECT pg_advisory_lock(${HOLD_KEY})`;
        await sql.unsafe(`
          CREATE OR REPLACE FUNCTION ctx_race_hold() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN PERFORM pg_advisory_xact_lock(${HOLD_KEY}); RETURN NULL; END $$`);
        await sql.unsafe(
          `CREATE TRIGGER ctx_race_hold_trg AFTER INSERT ON ${table}
             FOR EACH STATEMENT EXECUTE FUNCTION ctx_race_hold()`,
        );

        // PUT A: runs into the trigger and waits there, transaction open.
        const first = put(app, owner, id, bodyA);
        expect(await until(async () => (await lockWaiters('advisory')) >= 1, 15_000)).toBe(true);

        // PUT B is issued while A is held mid-transaction.
        const second = put(app, owner, id, bodyB);
        // B has reached its own wait (on A's rows or on whatever serialises
        // writers); the bound only keeps a pass-through implementation from hanging.
        await until(async () => (await lockWaiters()) >= 2, 5_000);

        await release();
        const [resA, resB] = await Promise.all([first, second]);

        expect(resA.statusCode).toBe(200);
        expect(resB.statusCode).toBe(200);

        await sql.unsafe(`DROP TRIGGER IF EXISTS ctx_race_hold_trg ON ${table}`);
        const read = await app.inject({ method: 'GET', url: `/${owner}/${id}/context` });
        expect(read.statusCode).toBe(200);
        const items = (read.json() as { items: Item[] }).items;
        expect([readA, readB]).toContainEqual(items);
      } finally {
        await release().catch(() => {});
        await holder.end({ timeout: 5 }).catch(() => {});
        await sql.unsafe(`DROP TRIGGER IF EXISTS ctx_race_hold_trg ON ${table}`);
        await sql.unsafe('DROP FUNCTION IF EXISTS ctx_race_hold()');
        await app.inject({ method: 'DELETE', url: `/${owner}/${id}` });
      }
    },
  );
});
