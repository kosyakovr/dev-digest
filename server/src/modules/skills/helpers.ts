import type { Skill, SkillImportPreview, SkillSource, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';
import {
  DEFAULT_SKILL_TYPE,
  MAX_DERIVED_DESCRIPTION_CHARS,
} from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the version-bump
 * rule, and markdown import parsing. No I/O: nothing here awaits, so it all
 * unit-tests without Docker.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch changes the skill's BODY relative to the existing row — the
 * only edit that bumps `version` and snapshots `skill_versions`.
 *
 * Renaming a skill, rewording its description or re-typing it deliberately does
 * NOT create a version: `skill_versions` stores the body alone, so a version
 * recording only a rename would be an exact duplicate of its predecessor and
 * would make every diff in the Versions tab show "no changes".
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/** An ATX heading: one-to-six '#' followed by whitespace and some text. */
const ATX_HEADING = /^#{1,6}\s+\S/;
/** A top-level ATX heading — the skill's title. */
const H1 = /^#\s+\S/;

/** Strip a directory path and a trailing `.md` / `.markdown` from a filename. */
function fileStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.(md|markdown)$/i, '');
}

/**
 * Derive a proposed skill from an uploaded markdown file. Nothing is persisted —
 * the route returns this as a preview and the client saves only on confirm.
 *
 * - name        first ATX `# ` heading, else the filename stem
 * - description first non-heading, non-blank line, capped
 * - body        the file VERBATIM, including the heading: the body is what goes
 *               into the prompt, and silently dropping its title would change
 *               the text the author reviewed in the preview.
 *
 * The content is parsed, never executed: a skill is text and nothing else.
 */
export function parseMarkdownSkill(filename: string, content: string): SkillImportPreview {
  const lines = content.split('\n');

  const headingLine = lines.find((l) => H1.test(l.trim()));
  const heading = headingLine?.trim().replace(/^#\s+/, '').trim();

  // Skip headings of ANY level, but test for a real ATX heading rather than a
  // leading '#': a line like "#482 is a stale PR" is prose, and dropping it
  // would leave a perfectly good description empty.
  const descriptionLine = lines.find((l) => {
    const t = l.trim();
    return t.length > 0 && !ATX_HEADING.test(t);
  });
  const description = (descriptionLine?.trim() ?? '').slice(0, MAX_DERIVED_DESCRIPTION_CHARS);

  return {
    name: heading && heading.length > 0 ? heading : fileStem(filename),
    description,
    type: DEFAULT_SKILL_TYPE,
    source: 'manual',
    body: content,
  };
}
