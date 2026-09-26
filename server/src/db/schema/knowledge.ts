import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

// House rules extracted from a repo. `evidenceLine` / `evidenceSnippet` are what
// CODE verified against the sampled file, not what the model claimed — see
// ../../../specs/L02-conventions.md. `status` is three-state on purpose: a
// re-scan replaces only `pending` rows, so a decided rule is never re-proposed.
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    rationale: text('rationale'),
    category: text('category', {
      enum: ['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'],
    })
      .notNull()
      .default('general'),
    evidencePath: text('evidence_path'),
    // Defaulted only so the ALTER stays safe on a non-empty table; every row the
    // service writes carries the line the evidence gate resolved.
    evidenceLine: integer('evidence_line').notNull().default(1),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
  },
  (t) => ({ repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt) }),
);
