import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * L05 onboarding tour — data access (ring ③). The ONLY place that touches the
 * `onboarding` table: one row per repo, the whole tour in its jsonb column.
 * Reads join `repos` so they are workspace-scoped; no Drizzle type leaves here.
 */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async findForRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ json: unknown; generatedAt: Date } | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
      .where(and(eq(t.onboarding.repoId, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row ? { json: row.json, generatedAt: row.generatedAt } : null;
  }

  /** Replace the repo's tour (upsert on the PK). A failing write is not swallowed. */
  async save(repoId: string, json: unknown, generatedAt: Date): Promise<void> {
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json, generatedAt } });
  }
}
