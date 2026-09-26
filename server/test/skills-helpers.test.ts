import { describe, it, expect } from 'vitest';
import {
  isBodyChange,
  parseMarkdownSkill,
  toSkillDto,
  toSkillVersionDto,
} from '../src/modules/skills/helpers.js';
import { MAX_DERIVED_DESCRIPTION_CHARS } from '../src/modules/skills/constants.js';
import type { SkillRow, SkillVersionRow } from '../src/modules/skills/repository.js';

/** Pure helpers — no DB, so these run in the unit suite (no `.it.` suffix). */

const row: SkillRow = {
  id: 'a3d1f0c2-0000-4000-8000-000000000001',
  workspaceId: 'ws-1',
  name: 'pr-quality-rubric',
  description: 'Rubric for PR quality.',
  type: 'rubric',
  source: 'manual',
  body: '# PR Quality Rubric\n\nBe useful.',
  enabled: true,
  version: 3,
  evidenceFiles: null,
  createdAt: new Date('2026-09-22T10:00:00.000Z'),
};

describe('toSkillDto', () => {
  it('maps a row to the snake_case wire DTO', () => {
    expect(toSkillDto(row)).toEqual({
      id: row.id,
      name: 'pr-quality-rubric',
      description: 'Rubric for PR quality.',
      type: 'rubric',
      source: 'manual',
      body: '# PR Quality Rubric\n\nBe useful.',
      enabled: true,
      version: 3,
      evidence_files: null,
    });
  });

  it('normalises a null evidence_files rather than dropping the key', () => {
    expect(toSkillDto({ ...row, evidenceFiles: ['src/a.ts'] }).evidence_files).toEqual([
      'src/a.ts',
    ]);
    expect('evidence_files' in toSkillDto(row)).toBe(true);
  });

  it('carries a user-authored type through unchanged', () => {
    // The type is a free-text label, not an enum — a name outside the four
    // seeded defaults must survive the mapper.
    expect(toSkillDto({ ...row, type: 'accessibility' }).type).toBe('accessibility');
  });
});

describe('toSkillVersionDto', () => {
  it('maps a snapshot row, serialising the timestamp', () => {
    const v: SkillVersionRow = {
      skillId: row.id,
      version: 2,
      body: '# v2',
      createdAt: new Date('2026-09-22T10:00:00.000Z'),
    };
    expect(toSkillVersionDto(v)).toEqual({
      skill_id: row.id,
      version: 2,
      body: '# v2',
      created_at: '2026-09-22T10:00:00.000Z',
    });
  });
});

describe('isBodyChange', () => {
  it('is true only when the body actually differs', () => {
    expect(isBodyChange(row, { body: 'something else' })).toBe(true);
    expect(isBodyChange(row, { body: row.body })).toBe(false);
  });

  it('is false for a metadata-only edit', () => {
    // The product rule: skill_versions stores the BODY alone, so a version
    // recording only a rename would duplicate its predecessor and every diff in
    // the Versions tab would read "no changes".
    expect(isBodyChange(row, {})).toBe(false);
  });
});

describe('parseMarkdownSkill', () => {
  it('takes the name from the first H1 and the description from the first prose line', () => {
    const p = parseMarkdownSkill('whatever.md', '# Secret Gate\n\nFlags leaked credentials.\n');
    expect(p.name).toBe('Secret Gate');
    expect(p.description).toBe('Flags leaked credentials.');
  });

  it('falls back to the filename stem when there is no heading', () => {
    expect(parseMarkdownSkill('no-then-chains.md', 'Prefer await.').name).toBe('no-then-chains');
    expect(parseMarkdownSkill('rules/a/b.markdown', 'text').name).toBe('b');
    expect(parseMarkdownSkill('UPPER.MD', 'text').name).toBe('UPPER');
  });

  it('keeps the body verbatim, heading included', () => {
    // The body IS the prompt block; dropping its title would change the text the
    // author just approved in the preview.
    const content = '# Title\n\nBody line.\n';
    expect(parseMarkdownSkill('x.md', content).body).toBe(content);
  });

  it('ignores headings of any level when deriving the description', () => {
    const p = parseMarkdownSkill('x.md', '# T\n\n## Section\n\nThe real sentence.');
    expect(p.description).toBe('The real sentence.');
  });

  it('caps a runaway first paragraph', () => {
    const p = parseMarkdownSkill('x.md', `# T\n\n${'z'.repeat(500)}`);
    expect(p.description).toHaveLength(MAX_DERIVED_DESCRIPTION_CHARS);
  });

  it('defaults an import to a manual custom skill', () => {
    const p = parseMarkdownSkill('x.md', '# T\n\ntext');
    expect(p.type).toBe('custom');
    expect(p.source).toBe('manual');
  });

  it('survives a file with no prose at all', () => {
    const p = parseMarkdownSkill('empty-ish.md', '# Only A Heading');
    expect(p.name).toBe('Only A Heading');
    expect(p.description).toBe('');
  });

  it('does not mistake a hashtag inside prose for a heading', () => {
    // `#482` is a PR reference, not an ATX heading: a heading needs `# ` + text.
    const p = parseMarkdownSkill('x.md', '#482 is not a title\n');
    expect(p.name).toBe('x');
    expect(p.description).toBe('#482 is not a title');
  });
});
