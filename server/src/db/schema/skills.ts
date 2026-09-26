import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, unique } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

/**
 * The catalogue behind the Skill editor's type dropdown. Types are user-editable
 * (typing a new name on save inserts it here), so this is a table rather than an
 * enum. `skills.type` deliberately holds the NAME rather than a FK: a type is a
 * label, and deleting one must never cascade into the skills that used it.
 */
export const skillTypes = pgTable(
  'skill_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: now(),
  },
  (t) => ({ nameUq: unique('skill_types_workspace_id_name_unique').on(t.workspaceId, t.name) }),
);

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  // Free text, NOT an enum: the four built-ins are seeded into `skill_types`,
  // but a user may save any name and it joins the catalogue. The SQL column has
  // never carried a CHECK constraint, so widening this was a TypeScript-only
  // change — see migration 0011.
  type: text('type').notNull(),
  source: text('source', {
    enum: ['manual', 'imported_url', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  createdAt: now(),
});

/**
 * Immutable body snapshots, one per version. Body only by design: renaming a
 * skill or changing its type is not a version-worthy edit, so those fields live
 * on `skills` alone and have no history.
 */
export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
