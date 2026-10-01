import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_DIR_SEGMENT,
  BOILERPLATE_INFIX,
  BOILERPLATE_LOCK_BASENAMES,
  BOILERPLATE_LOCK_SUFFIX,
  BOILERPLATE_ROOT_DIRS,
  BOILERPLATE_SUFFIXES,
  CLASSIFY_RULE_ORDER,
  DOCS_MARKDOWN_RE,
  DOCS_ROOT_DIRS,
  DOCS_UPPER_PREFIXES,
  SMART_DIFF_ROLE_ORDER,
  TEST_DIR_SEGMENTS,
  TEST_ROOT_DIRS,
  TEST_SUFFIXES,
  WIRING_BASENAMES,
  WIRING_DOCKER_COMPOSE_RE,
  WIRING_INFIXES,
  WIRING_PREFIXES,
  WIRING_ROOT_DIRS,
  WIRING_TSCONFIG_RE,
} from './constants.js';

/**
 * Smart-diff — pure functions only: no I/O, no DB, no DI wiring, no HTTP.
 * `classifyFile` is also the seam the L08 diff filter will import.
 */

interface PathParts {
  /** First path segment ('' for a bare file name). */
  first: string;
  /** Directory segments (everything but the basename). */
  dirs: string[];
  basename: string;
}

function splitPath(path: string): PathParts {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalised.split('/').filter((s) => s.length > 0);
  const basename = segments[segments.length - 1] ?? '';
  const dirs = segments.slice(0, -1);
  return { first: dirs[0] ?? '', dirs, basename };
}

const endsWithAny = (s: string, suffixes: readonly string[]) => suffixes.some((x) => s.endsWith(x));
const startsWithAny = (s: string, prefixes: readonly string[]) => prefixes.some((x) => s.startsWith(x));
const includesAny = (s: string, parts: readonly string[]) => parts.some((x) => s.includes(x));

const RULES: Record<(typeof CLASSIFY_RULE_ORDER)[number], (p: PathParts) => boolean> = {
  boilerplate: ({ first, dirs, basename }) =>
    BOILERPLATE_LOCK_BASENAMES.has(basename) ||
    basename.endsWith(BOILERPLATE_LOCK_SUFFIX) ||
    BOILERPLATE_ROOT_DIRS.has(first) ||
    dirs.includes(BOILERPLATE_DIR_SEGMENT) ||
    endsWithAny(basename, BOILERPLATE_SUFFIXES) ||
    basename.includes(BOILERPLATE_INFIX),
  tests: ({ first, dirs, basename }) =>
    endsWithAny(basename, TEST_SUFFIXES) ||
    dirs.some((d) => TEST_DIR_SEGMENTS.has(d)) ||
    TEST_ROOT_DIRS.has(first),
  wiring: ({ first, basename }) =>
    WIRING_BASENAMES.has(basename) ||
    includesAny(basename, WIRING_INFIXES) ||
    WIRING_TSCONFIG_RE.test(basename) ||
    startsWithAny(basename, WIRING_PREFIXES) ||
    WIRING_DOCKER_COMPOSE_RE.test(basename) ||
    WIRING_ROOT_DIRS.has(first),
  docs: ({ first, basename }) =>
    DOCS_MARKDOWN_RE.test(basename) ||
    DOCS_ROOT_DIRS.has(first) ||
    startsWithAny(basename.toUpperCase(), DOCS_UPPER_PREFIXES),
};

/** Role of a file path; rules checked in `CLASSIFY_RULE_ORDER`, first match wins, else `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const parts = splitPath(path);
  for (const role of CLASSIFY_RULE_ORDER) {
    if (RULES[role](parts)) return role;
  }
  return 'core';
}

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingInput {
  file: string;
  startLine: number;
}

export interface SmartDiffStats {
  roles: Record<SmartDiffRole, number>;
  filesWithFindings: number;
  unmatchedFindings: number;
}

const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/** Group files by role (display order, empty groups omitted) and attach finding lines. */
export function buildSmartDiff(
  files: readonly SmartDiffFileInput[],
  findings: readonly SmartDiffFindingInput[],
): { diff: SmartDiff; stats: SmartDiffStats } {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file);
    if (set) set.add(f.startLine);
    else linesByFile.set(f.file, new Set([f.startLine]));
  }

  const paths = new Set(files.map((f) => f.path));
  const unmatchedFindings = findings.filter((f) => !paths.has(f.file)).length;

  const roles = Object.fromEntries(SMART_DIFF_ROLE_ORDER.map((r) => [r, 0])) as Record<SmartDiffRole, number>;
  const byRole = new Map<SmartDiffRole, SmartDiff['groups'][number]['files']>();
  let filesWithFindings = 0;
  let totalLines = 0;

  for (const file of [...files].sort(byPath)) {
    const role = classifyFile(file.path);
    const finding_lines = [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b);
    if (finding_lines.length > 0) filesWithFindings += 1;
    totalLines += file.additions + file.deletions;
    roles[role] += 1;
    const list = byRole.get(role) ?? [];
    list.push({ path: file.path, additions: file.additions, deletions: file.deletions, finding_lines });
    byRole.set(role, list);
  }

  const groups = SMART_DIFF_ROLE_ORDER.flatMap((role) => {
    const list = byRole.get(role);
    return list ? [{ role, files: list }] : [];
  });

  return {
    diff: {
      groups,
      split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
    },
    stats: { roles, filesWithFindings, unmatchedFindings },
  };
}
