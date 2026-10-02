import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * L02 skills — CRUD, the body-only version rule, destructive restore, the type
 * catalogue, markdown import preview, and cross-workspace isolation.
 */
d('skills module', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const body = (over: Record<string, unknown> = {}) => ({
    name: `skill-${Math.random().toString(36).slice(2, 10)}`,
    description: 'A seeded test skill.',
    type: 'rubric',
    body: '# Rule\n\nOriginal body.',
    ...over,
  });

  async function create(app: Awaited<ReturnType<typeof makeApp>>, over = {}) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: body(over) });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; type: string; body: string };
  }

  // ---- CRUD ---------------------------------------------------------------

  it('creates a skill at version 1 and lists it', async () => {
    const app = await makeApp();
    const created = await create(app);
    expect(created.version).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { id: string }[]).some((s) => s.id === created.id)).toBe(true);
  });

  it('404s an unknown skill and 422s a non-uuid id', async () => {
    const app = await makeApp();
    const missing = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({ method: 'GET', url: '/skills/not-a-uuid' });
    expect(bad.statusCode).toBe(422);
  });

  it('deletes a skill and its version history', async () => {
    const app = await makeApp();
    const created = await create(app);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    const after = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(after.statusCode).toBe(404);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions).toHaveLength(0);

    // A second delete is a 404, not a silent success.
    const again = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(again.statusCode).toBe(404);
  });

  // ---- versioning ---------------------------------------------------------

  it('bumps the version and snapshots ONLY when the body changes', async () => {
    const app = await makeApp();
    const created = await create(app);

    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { name: 'renamed', description: 'new words', type: 'convention' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().version).toBe(1); // metadata-only → no new version

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nSecond body.' },
    });
    expect(edited.json().version).toBe(2);

    // Saving the SAME body again must not create a duplicate version.
    const noop = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nSecond body.' },
    });
    expect(noop.json().version).toBe(2);

    const list = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    const versions = list.json() as { version: number; body: string }[];
    expect(versions.map((v) => v.version)).toEqual([2, 1]); // newest first
    expect(versions[1]!.body).toBe('# Rule\n\nOriginal body.');
  });

  it('toggling enabled does not create a version', async () => {
    const app = await makeApp();
    const created = await create(app);
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { enabled: false },
    });
    expect(toggled.json()).toMatchObject({ enabled: false, version: 1 });
  });

  it('serves a single version and 404s an unknown one', async () => {
    const app = await makeApp();
    const created = await create(app);

    const v1 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: '# Rule\n\nOriginal body.' });

    const v9 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/9` });
    expect(v9.statusCode).toBe(404);

    const v0 = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions/0` });
    expect(v0.statusCode).toBe(422); // must be a positive integer
  });

  // ---- restore ------------------------------------------------------------

  it('restore rolls the body back AND deletes every newer version', async () => {
    const app = await makeApp();
    const created = await create(app);
    for (const text of ['second', 'third']) {
      await app.inject({
        method: 'PUT',
        url: `/skills/${created.id}`,
        payload: { body: `# Rule\n\n${text}` },
      });
    }

    const before = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect((before.json() as { version: number }[]).map((v) => v.version)).toEqual([3, 2, 1]);

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 1, body: '# Rule\n\nOriginal body.' });

    const after = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect((after.json() as { version: number }[]).map((v) => v.version)).toEqual([1]);

    // A later edit continues from the restored version, not from the discarded 3.
    const next = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nafter restore' },
    });
    expect(next.json().version).toBe(2);
  });

  it('restoring the newest version is a no-op that keeps the history', async () => {
    const app = await makeApp();
    const created = await create(app);
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\n\nsecond' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/2/restore`,
    });
    expect(res.json()).toMatchObject({ version: 2, body: '# Rule\n\nsecond' });

    const after = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect((after.json() as { version: number }[]).map((v) => v.version)).toEqual([2, 1]);
  });

  it('404s a restore of a version that does not exist', async () => {
    const app = await makeApp();
    const created = await create(app);
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/7/restore`,
    });
    expect(res.statusCode).toBe(404);
  });

  // ---- the type catalogue -------------------------------------------------

  it('a brand-new type name joins the catalogue on save', async () => {
    const app = await makeApp();
    const typeName = `accessibility-${Math.random().toString(36).slice(2, 8)}`;

    const before = await app.inject({ method: 'GET', url: '/skill-types' });
    expect((before.json() as { name: string }[]).map((x) => x.name)).not.toContain(typeName);

    await create(app, { type: typeName });

    const after = await app.inject({ method: 'GET', url: '/skill-types' });
    expect((after.json() as { name: string }[]).map((x) => x.name)).toContain(typeName);
  });

  it('registers a new type introduced by an update, and never duplicates one', async () => {
    const app = await makeApp();
    const typeName = `perf-${Math.random().toString(36).slice(2, 8)}`;
    const created = await create(app);

    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { type: typeName },
    });
    // Saving the same type twice must not violate the unique constraint.
    await create(app, { type: typeName });

    const rows = await pg.handle.db
      .select()
      .from(t.skillTypes)
      .where(and(eq(t.skillTypes.workspaceId, workspaceId), eq(t.skillTypes.name, typeName)));
    expect(rows).toHaveLength(1);
  });

  it('seeds the four built-in types', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/skill-types' });
    const names = (res.json() as { name: string }[]).map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['rubric', 'convention', 'security', 'custom']));
  });

  // ---- import preview -----------------------------------------------------

  it('previews a markdown import WITHOUT persisting it', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'secret-gate.md', content: '# Secret Gate\n\nFlags leaks.\n' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      name: 'Secret Gate',
      description: 'Flags leaks.',
      type: 'custom',
      source: 'manual',
      body: '# Secret Gate\n\nFlags leaks.\n',
    });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];
    expect(after).toHaveLength(before.length);
  });

  it('422s an import with an empty file', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.md', content: '' },
    });
    expect(res.statusCode).toBe(422);
  });

  // ---- tenancy ------------------------------------------------------------

  it('never serves a skill from another workspace', async () => {
    const db = pg.handle.db;
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
        body: '# secret',
      })
      .returning();

    const app = await makeApp();
    // The default workspace is the request context, so the foreign row 404s.
    expect((await app.inject({ method: 'GET', url: `/skills/${foreignSkill!.id}` })).statusCode)
      .toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreignSkill!.id}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreignSkill!.id}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${foreignSkill!.id}` })).statusCode,
    ).toBe(404);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as { id: string }[];
    expect(list.some((s) => s.id === foreignSkill!.id)).toBe(false);

    // And at the service layer, bypassing HTTP.
    const service = new SkillsService({ db } as unknown as Container);
    expect(await service.get(workspaceId, foreignSkill!.id)).toBeUndefined();
    expect(await service.listVersions(workspaceId, foreignSkill!.id)).toBeUndefined();
    expect(await service.restoreVersion(workspaceId, foreignSkill!.id, 1)).toBeUndefined();
  });
});
