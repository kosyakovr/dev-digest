# Insights — cross-package

Findings that span more than one package, or belong to the repo itself (CI,
Docker, root scripts, the vendored `@devdigest/shared` contracts).
Anything scoped to a single package goes in that package's `INSIGHTS.md`.

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into **every** session in this repo, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

- 2026-09-21 — An architecture grep rule needs no hand-maintained baseline table:
  run the SAME pattern at `HEAD` and at the merge-base (`git grep <pat> <rev>`) and
  subtract, keyed on (file, match text) and never on line number → grandfathered
  hits cancel by construction (the four §11 Drizzle-in-handler modules return
  identically at both revs), and `git grep -L` also works at a rev, so even the
  files-without-match tenancy check needs no special case. Bonus: `git grep` uses
  git's own regex engine, so one pattern behaves identically under ugrep, BSD grep
  and GNU grep. (ref: .claude/skills/pr-self-review/greps.md)
- 2026-09-19 — A drizzle migration can be added WITHOUT `pnpm db:generate`
  (forbidden by name in CLAUDE.md): copy the previous `meta/NNNN_snapshot.json`,
  set `id` to a fresh uuid and `prevId` to the old `id`, edit only the intended
  column, append the `_journal.json` entry, and write the `.sql` by hand → it
  applies cleanly (proven by the testcontainers run) and, unlike `db:generate`,
  cannot sweep up unrelated schema drift. Verify with a diff of the two
  snapshots minus the new column, and keep both files' missing trailing newline.
  (ref: server/src/db/migrations/0010_add_agent_run_cost.sql)
- 2026-09-20 — The root instruction file named above is now `AGENTS.md`; all five
  `CLAUDE.md` files were renamed and no `CLAUDE.md` remains in the repo. The
  `pnpm db:generate` prohibition itself is unchanged — only the file carrying it
  was renamed. No symlinks were added. (ref: AGENTS.md:1)

## What Doesn't Work

- 2026-09-21 — A Claude Code `PreToolUse` hook that invokes `node` directly can fail
  OPEN, which for a gate is the worst possible outcome: a non-zero hook exit is
  treated as an ERROR and the tool RUNS ANYWAY, and `node` here is an asdf shim
  that `env -i /bin/sh -c 'command -v node'` cannot find → put a POSIX `sh` wrapper
  in front that resolves node via `command -v` then the asdf/volta/Homebrew/
  `/usr/local`/nvm/fnm paths, and if none resolve emits an explicit
  `{"permissionDecision":"ask"}` and exits 0. Same rule when the gate itself
  throws: decide `ask`, never stay silent. Assert it under `env -i` in a test.
  (ref: .claude/hooks/pr-self-review-gate.sh)

- 2026-09-20 — Relying on Claude Code's DEFAULT `instructionFiles` mode after the
  `CLAUDE.md` → `AGENTS.md` rename is a silent-loss trap: the default
  `claude-md-or-agents-md` drops EVERY `AGENTS.md` in the project the moment the
  project has a `CLAUDE.md` of its own, and the engine counts
  `CLAUDE.md`, `.claude/CLAUDE.md` AND `CLAUDE.local.md` as that — so one
  developer's personal, untracked, gitignored-by-nobody `CLAUDE.local.md` in the
  repo root silently strips the root + all four package instruction files, with
  no warning and nothing to debug → do NOT create a `CLAUDE.md` or
  `CLAUDE.local.md` in this repo; there is currently no setting that prevents
  this. (ref: AGENTS.md:1)
  - 2026-09-20 — Measured, not assumed: dropping a `CLAUDE.local.md` into the
    repo root made all five `AGENTS.md` vanish from context (a canary line in
    each, queried via `claude -p` with all tools disallowed, returned only the
    `CLAUDE.local.md` canary). `"instructionFiles": "claude-md-and-agents-md"`
    in `.claude/settings.json` did NOT prevent it, and neither did the legacy
    `projectInstructions: "both"`: on 2.1.278 the option is a NO-OP — its
    strings and the four mode names are in the binary, but nothing reads them
    yet. The file is checked in anyway so the intent is already right when a
    later build wires it up. Control: an `env` key added to the same
    `.claude/settings.json` DID reach the agent's shell, so the file is read —
    it is this one option that is inert, not the settings file.
    (ref: .claude/settings.json:2)

- 2026-09-19 — Summing per-run cost with a plain SQL `SUM(cost_usd)` silently
  understates it, because the two layers disagree on what NULL means:
  `reviewer-core` treats null as STICKY (one unpriced chunk ⇒ the whole run's
  cost is null) while `SUM()` just skips NULL rows and returns a confident
  partial → treat null as "unknown" and never as 0, and decide per surface
  whether a partial total may be shown as authoritative.
  (ref: reviewer-core/src/review/run.ts:184, server/src/adapters/llm/pricing.ts:37)

- 2026-09-19 — A Zod schema in `*/src/vendor/shared/contracts/` does NOT imply a
  route serves it: `AgentColumn.cost_usd`, `MultiAgentRun.total_cost_usd` and
  `AgentStats` (contracts/observability.ts:46,82,108) plus `AgentPerfRow` /
  `AgentPerf.summary` (contracts/productionize.ts:152,177) have no server
  implementation at all — grepping their names hits only the contract file →
  before building UI or estimating work against a shared contract, confirm a
  registered route in `server/src/modules/` actually returns it.
  (ref: server/src/vendor/shared/contracts/observability.ts:46)

## Codebase Patterns

- 2026-09-19 — Per-run dollar cost is still computed end-to-end but deliberately
  severed at the server: `reviewer-core` accumulates a real per-call cost into
  `ReviewOutcome.costUsd` (preferring OpenRouter's actual `usage.cost` over an
  estimate), while `run-executor` destructures every other field of the outcome
  and silently drops that one, and `agent_runs.cost_usd` no longer exists →
  to surface run cost, re-plumb the value that is already there; do not build a
  second cost calculation. (ref: reviewer-core/src/review/run.ts:216,
  reviewer-core/src/llm/openrouter.ts:107,
  server/src/modules/reviews/run-executor.ts:213, commit d45ab0d)

## Tool & Library Notes

- 2026-09-20 — `grep` in this environment is **ugrep**, not GNU grep, so a
  shipped grep rule must be RUN before it is written into a skill or a CI
  script: an exclusion pattern using a BRE backreference —
  `grep -v "^src/modules/\([a-z-]*\)/[^:]*:.*modules/\1/"` — that GNU grep
  accepts died on `ugrep: error: error at position 46 ... invalid escape`, and
  the failure is a non-zero exit, not a wrong result, so it would have looked
  like a passing check inside a `||`-chained script → avoid backreferences;
  match the positive form directly (here `grep -rn "from '\.\./[a-z-]*/repository"
  src/modules`, which works because an intra-module import is always
  `./repository.js` and a cross-module one always `../<other>/repository.js`).
  Ship the EXPECTED output beside each rule too: of six rules written that day,
  two were heuristics with permanent benign hits (`repo-intel/repository.ts`
  scopes by `repoId` not `workspaceId`; `adapters/git/simple-git.ts` *sets*
  `GIT_TERMINAL_PROMPT` rather than reading config) and without that note every
  future session re-investigates them.
  (ref: .claude/skills/onion-architecture/SKILL.md §13)

- 2026-09-20 — `skills-lock.json` is NOT an inventory of installed skills: it
  lists `architecture-patterns` and `github-workflow-automation`, and neither
  directory exists anywhere in the repo (`find` finds nothing), while the
  hand-written `engineering-insights` skill exists and is absent from the lock
  file → to learn what skills a session actually has, list
  `.claude/skills/*/SKILL.md`; treat the lock file only as the provenance record
  of the ones pulled from GitHub, and keep locally authored skills out of it (it
  is off-limits per AGENTS.md anyway). (ref: skills-lock.json:4)

- 2026-09-20 — The `skill-creator` validator cannot run here: `python3
  .../skill-creator/scripts/quick_validate.py <dir>` dies on
  `ModuleNotFoundError: No module named 'yaml'` (system python3 has no PyYAML,
  and installing it is a dependency change) → validate a new SKILL.md by hand
  against the same limits — one `SKILL.md` at the folder root, frontmatter parses
  as a YAML mapping, `name` ≤ 64 chars, `description` ≤ 1024, body < 500 lines —
  e.g. with a throwaway `node -e` regex over the frontmatter.
  (ref: .claude/skills/frontend-ui-architecture/SKILL.md:1)

- 2026-09-20 — The `claude -p` canary technique used to measure the
  `CLAUDE.local.md` trap is not reproducible from inside a VSCode-extension
  session: there is no `claude` on `PATH` (`/opt/homebrew/bin`, `/usr/local/bin`
  and `~/.claude/local/` have no binary), so `Bash` cannot spawn a nested headless
  session → verify anything that depends on a fresh session's context (skill
  triggering, instruction-file loading) from a real terminal, and do not report
  such a check as done when it could not run.
  - 2026-09-21 — Correction: there IS a working `claude` binary reachable from a
    VSCode-extension session. `$CLAUDE_CODE_EXECPATH` points at
    `~/.vscode/extensions/anthropic.claude-code-<ver>-darwin-arm64/resources/native-binary/claude`,
    and `"$CLAUDE_CODE_EXECPATH" --version` returns `2.1.278 (Claude Code)`. It is
    missing from `PATH`, not from the machine → a nested headless run is possible
    with `"$CLAUDE_CODE_EXECPATH" -p '…'`, bearing in mind the nested session
    inherits `.claude/settings.json`, hooks included.

## Recurring Errors & Fixes

- 2026-09-21 — Second instance of "a shipped grep rule must be RUN before it goes
  into a skill" (the 2026-09-20 ugrep entry above was the first):
  `frontend-ui-architecture` §15 shipped `grep -rn 'fetch(' src/app src/components`,
  which also matches **`refetch()`** — four false positives in `client/`, every one
  a TanStack Query retry handler, and nobody had executed it → fixed to
  `[^a-zA-Z.]fetch\(` (0 hits). Both instances were in a §-numbered "Enforcement"
  section authored without running anything; treat those sections as untested code
  and run every pattern before trusting or shipping it.
  (ref: .claude/skills/frontend-ui-architecture/SKILL.md §15)

## Session Notes

- 2026-09-21 — Added the `pr-self-review` skill and its `PreToolUse` gate hook:
  routes the branch diff at the skills governing each changed file and denies
  `git push` while a CRITICAL stands. Design, limits and override paths in
  `docs/pr-self-review.md`; 23 offline hook cases in `.claude/hooks/test-gate.sh`.

- 2026-09-20 — Added the hand-written `frontend-ui-architecture` skill (structure
  and boundaries for React + Next.js) after establishing that `react-best-practices`
  and `next-best-practices` cover ~25 architecture bullets between them; sources and
  contested calls are in that skill's `README.md`.

- 2026-09-19 — L01 run-cost: spec-only session; mapped the previously removed
  per-run cost end-to-end before any implementation
  (spec: server/specs/L01-run-cost.md).

## Open Questions
