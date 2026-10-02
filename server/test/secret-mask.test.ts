import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SECRET_PATTERNS, maskSecrets } from '../src/platform/secret-mask.js';

/**
 * AC-9 + the secret-mask half of WP3. The source of truth for the secret shapes
 * is the Step 2 table in `.claude/agents/security-reviewer.md` (read only here);
 * `secret-mask.ts` is a runtime copy and must not drift from it.
 */

interface Row {
  name: string;
  pattern: string; // as written in the table (POSIX classes, `\|` escapes)
  sample: string; // `¦` removed
}

const doc = readFileSync(
  fileURLToPath(new URL('../../.claude/agents/security-reviewer.md', import.meta.url)),
  'utf8',
);

/** Rows of the secret table: `| name | `pattern` | `sample` |`. */
function tableRows(): Row[] {
  const rows: Row[] = [];
  for (const line of doc.split('\n')) {
    const m = /^\s*\|\s*([a-z][a-z0-9-]*)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/.exec(line);
    if (m) rows.push({ name: m[1]!, pattern: m[2]!, sample: m[3]!.replaceAll('¦', '') });
  }
  return rows;
}

/** Table pattern (grep -E, POSIX classes, `\|` for a literal pipe in a cell) -> JS RegExp source. */
const toJsSource = (p: string) =>
  p.replaceAll('\\|', '|').replaceAll('[[:space:]]', '\\s').replaceAll('[:space:]', '\\s');

/** `RegExp.source` escapes `/`; the table does not. */
const unescapeSlash = (s: string) => s.replaceAll('\\/', '/');

/** A copy without the `g` flag, so `.test` has no lastIndex state. */
const once = (re: RegExp) => new RegExp(re.source, re.flags.replace('g', ''));

describe('SECRET_PATTERNS vs the security-reviewer Step 2 table (AC-9 drift)', () => {
  const rows = tableRows();

  it('the table parses to the 10 documented rows', () => {
    expect(rows.map((r) => r.name)).toEqual([
      'aws-key',
      'google-api',
      'generic-assignment',
      'mongodb-uri',
      'postgres-uri',
      'private-key',
      'github-token',
      'npm-token',
      'slack-token',
      'llm-key',
    ]);
  });

  it('the set of names is identical: a row added or removed on either side fails', () => {
    expect(SECRET_PATTERNS.map((p) => p.name).sort()).toEqual(rows.map((r) => r.name).sort());
  });

  it('each table sample matches its runtime regex', () => {
    for (const row of rows) {
      const entry = SECRET_PATTERNS.find((p) => p.name === row.name);
      expect(entry, `runtime pattern for ${row.name}`).toBeDefined();
      expect(once(entry!.re).test(row.sample), `${row.name}: ${row.sample}`).toBe(true);
    }
  });

  it('each table pattern is the same regex as the runtime one (an edited row fails)', () => {
    for (const row of rows) {
      const entry = SECRET_PATTERNS.find((p) => p.name === row.name)!;
      expect(unescapeSlash(entry.re.source), row.name).toBe(toJsSource(row.pattern));
    }
  });
});

describe('maskSecrets', () => {
  // [name, the part of the sample that must be gone, whether the whole sample is the match]
  const SECRET_PART: Record<string, [string, boolean]> = {
    'aws-key': ['ABCDEFGHIJKLMNOP', true],
    'google-api': ['SyA1234567890abcdefghijklmnopqrstuv', true],
    'generic-assignment': ['abcdefgh1234', false],
    'mongodb-uri': ['user:pass@', false],
    'postgres-uri': ['user:pw@', false],
    'private-key': ['PRIVATE KEY', true],
    'github-token': ['abcdefghijklmnopqrstuvwxyz0123456789', true],
    'npm-token': ['abcdefghijklmnopqrstuvwxyz0123456789', true],
    'slack-token': ['1234567890-abcdef', true],
    'llm-key': ['abcdefghijklmnopqrstuv', true],
  };

  for (const row of tableRows()) {
    it(`masks the ${row.name} sample down to 4 chars plus …[masked]`, () => {
      const out = maskSecrets(row.sample);
      const head = `${row.sample.slice(0, 4)}…[masked]`;
      const [secret, whole] = SECRET_PART[row.name]!;
      expect(out.startsWith(head)).toBe(true);
      expect(out).not.toContain(secret);
      if (whole) expect(out).toBe(head);
    });
  }

  it('leaves text without a secret shape unchanged', () => {
    expect(maskSecrets('hello world')).toBe('hello world');
    expect(maskSecrets('review: agent "Security" done — 2 finding(s)')).toBe(
      'review: agent "Security" done — 2 finding(s)',
    );
  });

  it('masks a secret inside a sentence and keeps the rest', () => {
    expect(maskSecrets('leaked AKIAIOSFODNN7EXAMPLE in the diff')).toBe('leaked AKIA…[masked] in the diff');
  });

  it('masks every occurrence, and gives the same answer when called again (no regex state leaks)', () => {
    const text = 'a AKIAIOSFODNN7EXAMPLE b AKIAABCDEFGHIJKLMNOP c';
    const want = 'a AKIA…[masked] b AKIA…[masked] c';
    expect(maskSecrets(text)).toBe(want);
    expect(maskSecrets(text)).toBe(want);
  });
});
