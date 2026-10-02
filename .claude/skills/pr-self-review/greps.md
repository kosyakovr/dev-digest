# Greps — run at two revisions, report the difference

The architecture skills ship zero-dependency grep rules (`onion-architecture` §13,
`frontend-ui-architecture` §15). Run against the worktree they are nearly useless
here: the repo has 56 pre-existing deep-relative imports, four grandfathered
Drizzle-in-handler modules, and seven wildcard barrels. Every run would drown in
hits that nobody is going to fix.

So run the **same pattern at `HEAD` and at the merge-base, and subtract**:

```bash
MB=$(git merge-base main HEAD)
git grep -nE '<pattern>' HEAD  -- <pathspec>   # hits_head
git grep -nE '<pattern>' "$MB" -- <pathspec>   # hits_base
# new_hits = hits_head − hits_base
```

**Compare by `(file, normalised match text)`, never by line number** — line numbers
shift when anything above them changes; the matched text does not.

Normalise **only the match text**, and keep the field delimiter out of it. The
obvious one-liner is wrong:

```bash
# WRONG — collapsing all whitespace eats the tab between path and match,
# so every later "is this file in the diff?" lookup silently misses.
sed -E 's/[[:space:]]+/ /g'
```

Collapse runs of whitespace inside the match only (`awk -F'\t'` on field 2). The
failure is silent: the subtraction still returns the right *count*, so it looks
like it worked, while every hit gets misclassified as non-blocking drift.

Three reasons this beats a hand-maintained baseline table:

- **Grandfathered hits cancel mechanically.** The four modules in
  `onion-architecture` §11 that query Drizzle from the handler appear in *both*
  revisions, so they can never become a finding. No table to keep in sync.
- **It works for rules that never had a baseline.** §15 has no expected-output
  table at all.
- **`git grep` uses git's own regex engine**, so patterns behave identically in a
  Bash tool call (where `grep` is ugrep here), in the hook's plain shell (BSD
  grep), and in CI (GNU grep). This sidesteps the ugrep backreference trap
  recorded in the root `INSIGHTS.md` entirely.

## Scoping a new hit

| Where the new hit is | What it is |
|---|---|
| In a file that is **in the diff**, status `A` | **WARNING** (see the severity ceiling below) |
| In a file that is **in the diff**, status `M` | **SUGGESTION** |
| In a **test file or fixture** (`*.test.*`, `test/**`, `fixtures/**`) | **SUGGESTION**, whatever its status |
| In a file **not in the diff** | `drift_hits` — recorded, **never blocks**. A rename or a base-branch move causes these, and they are not this branch's fault |
| Present in **both** revisions | Invisible. Grandfathered by construction |

### A grep hit is capped at WARNING — with one exception

A pattern match is evidence of a *convention* violation. Measured against this
repo's own rubric, CRITICAL means "a security breach, data loss/corruption,
incorrect results, a crash, or a broken contract". A deep-relative import is none
of those, so it must never block a push.

This was not theoretical. Run on this branch, `fe-15-deep-relatives` found three
genuinely new hits — all of them `import messages from "../../../../…"` inside two
**newly added test files**. Under a mechanical "new file ⇒ CRITICAL" rule that
would have blocked the push over an import path. A gate that does that once gets
bypassed forever after.

**The one exception is `onion-13-tenancy-guard`**, which may be CRITICAL on an
`A`-status file. `onion-architecture` §7 is explicit that workspace scoping is "a
tenancy guard, not a filter; a query without it is a security bug" — that clears
the CRITICAL bar on its own terms. Even then it is a *heuristic*: read the hit
before reporting it, the way §13 instructs.

Everything else tops out at WARNING. If a grep hit genuinely represents a
correctness defect, a reviewer agent will find it by reading the code and report it
with a mechanism — which is what earns a CRITICAL.

## The patterns

The first ten were run at `HEAD` and at the merge-base of this repo on 2026-09-21; `rc-purity` was added 2026-10-01 (0 hits at `438513f`). The
"both revs" column is the count that cancels out — it is diagnostic, not a
baseline to maintain, and it will drift as the repo changes. That is fine.

### From `onion-architecture` §13 — run when `server/src/**` is in the diff

| id | pattern | pathspec | both revs | sample |
|---|---|---|---|---|
| `onion-13-db-in-boundary` | `drizzle-orm` | `:(glob)server/src/modules/*/routes.ts` | 4 | `import { eq } from 'drizzle-orm';` |
| `onion-13-framework-in-service` | `from 'fastify` | `:(glob)server/src/modules/*/service.ts` | 0 | `import type { FastifyInstance } from 'fastify';` |
| `onion-13-rowtype-leak` | `\$inferSelect` | `:(glob)server/src/modules/*/service.ts` | 0 | `type R = typeof t.$inferSelect;` |
| `onion-13-cross-module-reach` | `from '\.\./[a-z-]+/repository` | `server/src/modules` | 0 | `import { r } from '../reviews/repository.js';` |
| `onion-13-config-bypass` | `process\.env` | `server/src` `:(exclude)server/src/platform/config.ts` `:(exclude)server/src/adapters/secrets` | 5 | `const k = process.env.FOO;` |
| `onion-13-tenancy-guard` | *(files-without-match)* `workspaceId` | `:(glob)server/src/modules/*/repository.ts` | 1 | `const workspaceId = 1;` |

The tenancy check uses `git grep -L`, which works at a revision:

```bash
git grep -L 'workspaceId' "$MB" -- ':(glob)server/src/modules/*/repository.ts'
```

The last two are **heuristics, not rules** — §13 says so. `repo-intel/repository.ts`
scopes by `repoId`, which the caller already resolved inside a workspace;
`adapters/git/simple-git.ts` *sets* `GIT_TERMINAL_PROMPT` rather than reading
config. Read the hit before calling it a violation. Subtraction already hides all
of these, so they should only ever reach you as genuinely new.

### From `frontend-ui-architecture` §15 — run when `client/src/**` is in the diff

| id | pattern | pathspec | both revs | sample |
|---|---|---|---|---|
| `fe-15-deep-relatives` | `\.\./\.\./\.\.` | `client/src` | 56 | `import m from "../../../a.json";` |
| `fe-15-fetch-in-ui` | `[^a-zA-Z.]fetch\(` | `:(glob)client/src/app/**/*.tsx` `:(glob)client/src/components/**/*.tsx` | 0 | `const r = await fetch(url);` |
| `fe-15-wildcard-barrels` | *(files-with-match)* `export \*` | `client/src` | 7 | `export * from './a';` |
| `fe-15-junk-drawer` | *(path check, see below)* | `client/src` | 0 | `client/src/lib/utils.ts` |

The shipped §15 pattern for the second rule is `fetch(`, which matches
**`refetch()`** — four false positives in `client/` today, all of them TanStack
Query retry handlers. The leading `[^a-zA-Z.]` fixes it: 0 hits. §15 has been
corrected in place.

The junk-drawer check is a path check, not a content grep:

```bash
git ls-tree -r --name-only HEAD -- client/src | grep -E '(^|/)utils(\.ts)?$'
```

Run it at both revisions; a path listed at the new revision and not at the base is
a new hit (`scripts/review-greps.sh` reads the pattern out of this command line and
the pathspec out of the table row).

### From reviewer-core AGENTS.md — run when reviewer-core/src/** is in the diff

`reviewer-core/AGENTS.md` § Must not break: `reviewer-core/src` imports no DB,
GitHub, filesystem or process APIs. (Moved here from `architecture-reviewer.md`
Step 3 — one source.) In a markdown table a literal pipe is written `\|`;
`scripts/review-greps.sh` unescapes it.

| id | pattern | pathspec | both revs | sample |
|---|---|---|---|---|
| `rc-purity` | `from '(pg\|postgres\|drizzle-orm[^']*\|simple-git\|@octokit/[^']*\|node:fs[^']*\|fs\|fs/promises\|node:child_process\|child_process)'` | `reviewer-core/src` | 0 | `import { Pool } from 'pg';` |

## Machine-readable by design

`scripts/review-greps.sh` PARSES the tables above (and the secret-pattern table in
`.claude/agents/security-reviewer.md` Step 2) — it hard-codes no pattern. Keep the
row shape `| id | pattern | pathspec(s) | both revs | sample |`: pattern and sample
in backticks, pathspecs in backticks separated by spaces, `\|` for a literal pipe.
`sample` is a string the pattern MUST match; `review-greps.sh --self-test` asserts
that with `git grep -E`, so a pattern written in another regex dialect (`\s`) cannot
ship untested. In a secret-table sample a `¦` is removed before testing, so the
sample does not itself match the pattern when it sits in a tracked file.

## Reporting

Each group that ran greps returns them in its `greps` array:

```json
{ "id": "fe-15-deep-relatives",
  "status": "pass | regression",
  "baseline_hits": 56,
  "new_hits": ["client/src/app/x/_components/Y.tsx:12"],
  "drift_hits": [] }
```

`status` is `regression` iff `new_hits` is non-empty. A regression in a diffed file
becomes a finding with `source_skill` set to the owning skill and `source_rule` to
the section (`§13` or `§15`); `drift_hits` never becomes a finding.
