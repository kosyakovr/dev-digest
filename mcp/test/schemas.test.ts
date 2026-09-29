/**
 * WP5.tests — local wire schemas (Contract § D2-O3: lenient, unknown keys
 * stripped, loosely-typed enums).
 */
import { describe, expect, it } from 'vitest';
import { FindingWire, ReviewWire } from '../src/contracts.js';

describe('ReviewWire', () => {
  it('accepts a verdict value not in the server enum, and strips an unknown key', () => {
    const result = ReviewWire.safeParse({
      id: 'r1',
      run_id: null,
      agent_id: null,
      agent_name: null,
      kind: 'review',
      verdict: 'LGTM-ish',
      summary: null,
      score: null,
      model: null,
      created_at: '2024-01-01T00:00:00Z',
      findings: [],
      grounding: 'extra field the server contract has but this one does not read',
    });
    expect(result.success).toBe(true);
  });
});

describe('FindingWire', () => {
  it('fails when title is missing, with the issue path ["title"]', () => {
    const result = FindingWire.safeParse({
      id: 'f1',
      severity: 'CRITICAL',
      category: 'bug',
      file: 'a.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'because',
      confidence: 0.9,
      dismissed_at: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['title']);
    }
  });
});
