import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * L05 risk brief — data access (ring ③). The ONLY place that touches the
 * `pr_brief` table: one row per pull request, the whole brief in its jsonb
 * column. Reads join `pull_requests` so they are workspace-scoped; no Drizzle
 * type leaves here.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async findForPull(workspaceId: string, prId: string): Promise<{ json: unknown } | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row ? { json: row.json } : null;
  }

  /** Replace the PR's brief (upsert on the PK). A failing write is not swallowed. */
  async save(prId: string, json: unknown): Promise<void> {
    const values: typeof t.prBrief.$inferInsert = { prId, json };
    await this.db
      .insert(t.prBrief)
      .values(values)
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
