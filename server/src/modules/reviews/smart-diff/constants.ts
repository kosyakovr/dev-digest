import type { SmartDiffRole } from '@devdigest/shared';

/** Smart-diff literals. Pure data — no I/O (L08 imports the classifier without HTTP). */

/** Display order of the role groups (matches the `SmartDiffRole` enum order). */
export const SMART_DIFF_ROLE_ORDER = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const satisfies readonly SmartDiffRole[];

/** Rules are checked in this order, first match wins; `core` is the fallback. */
export const CLASSIFY_RULE_ORDER = ['boilerplate', 'tests', 'wiring', 'docs'] as const;

// ---- boilerplate ----------------------------------------------------------
export const BOILERPLATE_LOCK_BASENAMES: ReadonlySet<string> = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);
export const BOILERPLATE_LOCK_SUFFIX = '.lock';
/** Matched against the FIRST path segment only. */
export const BOILERPLATE_ROOT_DIRS: ReadonlySet<string> = new Set(['dist', 'build']);
export const BOILERPLATE_DIR_SEGMENT = '__snapshots__';
export const BOILERPLATE_SUFFIXES = ['.snap', '.min.js'] as const;
export const BOILERPLATE_INFIX = '.generated.';

// ---- tests ----------------------------------------------------------------
export const TEST_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts'] as const;
/** Matched against any DIRECTORY segment (never the basename). */
export const TEST_DIR_SEGMENTS: ReadonlySet<string> = new Set(['test', 'tests', '__tests__']);
export const TEST_ROOT_DIRS: ReadonlySet<string> = new Set(['e2e']);

// ---- wiring ---------------------------------------------------------------
export const WIRING_BASENAMES: ReadonlySet<string> = new Set(['index.ts', 'index.js']);
export const WIRING_INFIXES = ['.config.', '.environment.'] as const;
export const WIRING_PREFIXES = ['.eslintrc', '.env'] as const;
export const WIRING_TSCONFIG_RE = /^tsconfig.*\.json$/;
export const WIRING_DOCKER_COMPOSE_RE = /^docker-compose.*\.yml$/;
export const WIRING_ROOT_DIRS: ReadonlySet<string> = new Set(['.github', '.claude']);

// ---- docs -----------------------------------------------------------------
export const DOCS_MARKDOWN_RE = /\.md$/i;
export const DOCS_ROOT_DIRS: ReadonlySet<string> = new Set(['docs']);
/** Matched against the UPPERCASED basename. */
export const DOCS_UPPER_PREFIXES = ['README', 'CHANGELOG', 'LICENSE'] as const;
