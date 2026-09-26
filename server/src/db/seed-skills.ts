/**
 * Starter skills for the L02 Skills feature, plus the built-in type names.
 *
 * Kept out of `seed.ts` so the reviewer prompts and the skill bodies — both long
 * markdown blobs — do not drown the seeding logic, mirroring `seed-prompts.ts`.
 *
 * A skill body is TEXT that becomes one block of a review prompt. It carries no
 * executable part: write rules, not instructions to run anything.
 */

/** Seeded into `skill_types` so the editor's dropdown is never empty. */
export const BUILTIN_TYPE_NAMES = ['rubric', 'convention', 'security', 'custom'] as const;

export interface SeedSkill {
  name: string;
  description: string;
  type: string;
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description:
      'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    type: 'rubric',
    source: 'manual',
    body: `# PR Quality Rubric

Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for 5
high-signal findings, not 50.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Tests
- Are new branches covered by assertions?
- Are the tests meaningful, rather than snapshot churn?

## Scope
- Does the diff stay within the stated intent?
- Flag out-of-scope changes separately rather than blocking on them.`,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Flags credentials and key-shaped strings committed in a diff.',
    type: 'security',
    source: 'manual',
    body: `# Secret Leakage Gate

Treat any credential added in this diff as CRITICAL, even in tests, fixtures or
comments — a committed secret is leaked the moment it reaches the remote, and
"it's only a test key" is not a mitigation.

Look for:
- provider key prefixes (\`sk_live_\`, \`ghp_\`, \`AKIA\`, \`service_role\`)
- private key headers (\`-----BEGIN ... PRIVATE KEY-----\`)
- connection strings carrying an inline password
- a server-only secret moved behind a client-exposed prefix

Report the file and line, and say what should replace it (an env var read at
runtime, or the project's secrets provider). Do not reproduce the secret value
itself in the finding.`,
  },
  {
    name: 'no-then-chains',
    description: 'House rule: prefer async/await over .then() chains.',
    type: 'convention',
    source: 'manual',
    body: `# Prefer async/await

This codebase uses \`async\`/\`await\` throughout. Flag a new \`.then()\` /
\`.catch()\` chain as a SUGGESTION and show the awaited form.

Do not flag:
- \`.catch()\` attached to a deliberately un-awaited background promise
- \`Promise.all\` / \`Promise.allSettled\`, which stay as they are
- existing chains the diff merely moves without otherwise touching`,
  },
];
