import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { NewPrIntentRow, PrCommitRow, PrIntentRow, PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, row: Required<NewPrIntentRow>): Promise<void> {
  const { prId: _prId, ...set } = row;
  await db
    .insert(t.prIntent)
    .values(row)
    .onConflictDoUpdate({ target: t.prIntent.prId, set });
}

/** Workspace-scoped: joins the PR so another workspace's id yields `undefined`. */
export async function getIntent(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PrIntentRow | undefined> {
  const [res] = await db
    .select({ intent: t.prIntent })
    .from(t.prIntent)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
    .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
  return res?.intent;
}

/** Workspace-scoped: joins the PR so another workspace's id yields `[]`. Oldest first. */
export async function getPrCommits(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PrCommitRow[]> {
  const rows = await db
    .select({ commit: t.prCommits })
    .from(t.prCommits)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prCommits.prId))
    .where(and(eq(t.prCommits.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)))
    .orderBy(asc(t.prCommits.committedAt), asc(t.prCommits.sha));
  return rows.map((r) => r.commit);
}
