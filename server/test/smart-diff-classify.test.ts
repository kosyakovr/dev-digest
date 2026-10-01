import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
// Pure module: no buildApp, no DB — the L08 seam must be callable without HTTP.
import { classifyFile } from '../src/modules/reviews/smart-diff/helpers.js';

/** Table = the Smart Diff plan's WP3.tests table (rule order boilerplate → tests → wiring → docs → core). */
const CASES: ReadonlyArray<readonly [string, SmartDiffRole]> = [
  // boilerplate
  ['pnpm-lock.yaml', 'boilerplate'],
  ['server/pnpm-lock.yaml', 'boilerplate'],
  ['e2e/package-lock.json', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['dist/index.js', 'boilerplate'],
  ['build/out.js', 'boilerplate'],
  ['src/build/plan.ts', 'core'],
  ['src/__snapshots__/a.test.ts.snap', 'boilerplate'],
  ['test/fixtures/x.snap', 'boilerplate'],
  ['src/api.generated.ts', 'boilerplate'],
  ['public/vendor.min.js', 'boilerplate'],
  // tests
  ['src/a.test.ts', 'tests'],
  ['src/A.test.tsx', 'tests'],
  ['server/test/smart-diff.it.test.ts', 'tests'],
  ['src/a.spec.ts', 'tests'],
  ['server/test/helpers/index.ts', 'tests'],
  ['src/__tests__/util.ts', 'tests'],
  ['e2e/specs/05-pr-diff.flow.json', 'tests'],
  ['src/contest/foo.ts', 'core'],
  ['src/tests.ts', 'core'],
  // wiring
  ['client/src/vendor/shared/index.ts', 'wiring'],
  ['lib/index.js', 'wiring'],
  ['vitest.config.ts', 'wiring'],
  ['client/next.config.mjs', 'wiring'],
  ['tsconfig.json', 'wiring'],
  ['server/tsconfig.build.json', 'wiring'],
  ['.eslintrc.cjs', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.dev.yml', 'wiring'],
  ['.github/workflows/client.yml', 'wiring'],
  ['.claude/agents/planner.md', 'wiring'],
  ['src/app.environment.ts', 'wiring'],
  ['docs/index.ts', 'wiring'],
  // docs
  ['README.md', 'docs'],
  ['server/specs/L03-smart-diff.md', 'docs'],
  ['docs/hand-written-migrations.md', 'docs'],
  ['docs/diagram.png', 'docs'],
  ['CHANGELOG', 'docs'],
  ['LICENSE', 'docs'],
  ['readme.txt', 'docs'],
  // core (fallback) and path normalisation
  ['./src/x.ts', 'core'],
  ['server\\src\\a.ts', 'core'],
  ['server/src/modules/reviews/service.ts', 'core'],
  ['client/src/app/layout.tsx', 'core'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
