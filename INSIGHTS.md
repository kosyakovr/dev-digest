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

> **Consolidated 2026-09-22 and 2026-09-23**, both with the user's approval:
> merged parent+correction pairs, condensed long entries, and moved settled
> knowledge out (the grep baseline to `docs/pr-self-review.md`, the hand-written
> migration recipe to [docs/hand-written-migrations.md](docs/hand-written-migrations.md)).
> No finding was dropped. Prior text: `git show HEAD:INSIGHTS.md`.

## What Works

- 2026-09-23 — The course author's own implementation of each lesson is in this
  repo's history, REVERTED (`c6af1e4` "homework belongs in forks" rolled back
  `641b637` "feat(conventions): …"), so it is unreachable from `main` and
  `git log` on its deleted paths shows nothing → before designing a lesson
  feature run `git log --all --grep '<feature>'` (or `--diff-filter=D`): the
  commit message carries measured findings and `docs/specs/conventions.md` is a
  full design doc. It will not cherry-pick (different base) but it names the
  traps — e.g. a structured response's FIELD ORDER is generation order, so
  `category` placed first collapsed a live scan to one category and a flat 0.90
  confidence. Tell the user when you use it: it is someone else's homework.

- 2026-09-19 — A drizzle migration can be added WITHOUT `pnpm db:generate`
  (forbidden by name in AGENTS.md), and the hand-written route is also the safer
  one — it cannot sweep up unrelated schema drift. Full procedure, including the
  byte-for-byte snapshot round-trip and the throwaway-database check, is in
  [docs/hand-written-migrations.md](docs/hand-written-migrations.md). Proven on
  `0011_add_skill_types` and `0012_add_convention_triage`.

## What Doesn't Work

- 2026-09-21 — A Claude Code `PreToolUse` hook that invokes `node` directly can
  fail OPEN, the worst outcome for a gate: a non-zero hook exit is treated as an
  ERROR and the tool RUNS ANYWAY, and `node` here is an asdf shim that
  `env -i /bin/sh -c 'command -v node'` cannot find → put a POSIX `sh` wrapper in
  front that resolves node via `command -v` then the asdf/volta/Homebrew/
  `/usr/local`/nvm/fnm paths, and emits an explicit `{"permissionDecision":"ask"}`
  and exits 0 when none resolve. Same rule when the gate itself throws: decide
  `ask`, never stay silent. Assert it under `env -i` in a test.
  (ref: .claude/hooks/pr-self-review-gate.sh)

- 2026-09-20 — Do NOT create a `CLAUDE.md` or `CLAUDE.local.md` here: the default
  `instructionFiles` mode (`claude-md-or-agents-md`) drops EVERY `AGENTS.md` the
  moment the project has a `CLAUDE.md` of its own, and the engine counts
  `CLAUDE.md`, `.claude/CLAUDE.md` AND `CLAUDE.local.md` as that — so one
  developer's untracked `CLAUDE.local.md` silently strips the root plus all four
  package instruction files, with no warning and nothing to debug. Measured, not
  assumed: a canary in each of the five files, queried via `claude -p`, returned
  only the `CLAUDE.local.md` one. On 2.1.278 neither
  `"instructionFiles": "claude-md-and-agents-md"` nor the legacy
  `projectInstructions: "both"` prevents it — both are NO-OPs (an `env` key in the
  same file DID reach the agent, so the file itself is read), though the setting
  is checked in anyway. (ref: .claude/settings.json:2)

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

- 2026-09-22 — Per-run dollar cost is plumbed end-to-end: `agent_runs.cost_usd`
  exists again (`0010_add_agent_run_cost.sql`, `schema/runs.ts:22`) and
  `run-executor` persists `ReviewOutcome.costUsd` → read the stored value, never
  re-derive cost. The NULL-semantics entry above still governs aggregation. The
  column was absent between `d45ab0d` and the L01 lesson, so older code and
  designs that assume it is missing are stale, not wrong.
  (ref: server/src/modules/reviews/run-executor.ts:266,287)

## Tool & Library Notes

- 2026-09-20 — `grep` in this environment is **ugrep**, not GNU grep: a BRE
  backreference (`grep -v "^src/modules/\([a-z-]*\)/[^:]*:.*modules/\1/"`) that
  GNU grep accepts dies on `ugrep: error: ... invalid escape`, and it fails with a
  non-zero EXIT rather than a wrong result, so inside a `||`-chained script it
  looks like a passing check → avoid backreferences and match the positive form
  directly. (ref: .claude/skills/onion-architecture/SKILL.md §13)

- 2026-09-20 — `skills-lock.json` is NOT an inventory of installed skills: it
  lists `architecture-patterns` and `github-workflow-automation`, and neither
  directory exists anywhere in the repo, while the hand-written
  `engineering-insights` skill exists and is absent from the lock file → to learn
  what skills a session actually has, list `.claude/skills/*/SKILL.md`; treat the
  lock file only as the provenance record of the ones pulled from GitHub, and
  keep locally authored skills out of it (it is off-limits per AGENTS.md anyway).
  (ref: skills-lock.json:4)

- 2026-09-21 — A nested headless Claude run IS possible from a VSCode-extension
  session even though no `claude` is on `PATH`: `$CLAUDE_CODE_EXECPATH` points at
  the extension's `resources/native-binary/claude` (2.1.278) → use
  `"$CLAUDE_CODE_EXECPATH" -p '…'` to verify anything needing a FRESH session's
  context (skill triggering, instruction-file loading); it inherits
  `.claude/settings.json`, hooks included. Never report such a check as done when
  it could not run.

- 2026-09-20 — The `skill-creator` validator cannot run here: `quick_validate.py`
  dies on `ModuleNotFoundError: No module named 'yaml'` (system python3 has no
  PyYAML, and installing it is a dependency change) → validate a new SKILL.md by
  hand against the same limits (one `SKILL.md` at the folder root, frontmatter
  parses as a YAML mapping, `name` ≤ 64 chars, `description` ≤ 1024, body < 500
  lines), e.g. with a throwaway `node -e` regex.

## Recurring Errors & Fixes

- 2026-09-21 — Second instance of "a shipped grep rule must be RUN before it goes
  into a skill" (the 2026-09-20 ugrep entry above was the first):
  `frontend-ui-architecture` §15 shipped `grep -rn 'fetch(' src/app src/components`,
  which also matches **`refetch()`** — four false positives in `client/`, every one
  a TanStack Query retry handler, and nobody had executed it → fixed to
  `[^a-zA-Z.]fetch\(` (0 hits). Both instances were in a §-numbered "Enforcement"
  section authored without running anything; treat those sections as untested code
  and run every pattern before trusting or shipping it. Ship the EXPECTED output
  beside each rule too: two of the six onion-architecture rules are heuristics
  with permanent benign hits (`repo-intel/repository.ts` scopes by `repoId` not
  `workspaceId`; `adapters/git/simple-git.ts` *sets* `GIT_TERMINAL_PROMPT`), and
  without that note every future session re-investigates them.
  (ref: .claude/skills/frontend-ui-architecture/SKILL.md §15)
  - 2026-09-22 — Third instance, same root cause in a different file type: an
    e2e flow shipped a command form that does not exist. Details and the fix are
    in `e2e/INSIGHTS.md` (one insight, one file).

## Session Notes

- 2026-09-23 — L02 conventions: cross-package feature (migration 0012 extending
  `conventions`, contracts in both vendored copies, a `SKILLS LAB` nav section,
  one live scan at $0.0029) (spec: server/specs/L02-conventions.md).
- 2026-09-22 — L02 skills: cross-package feature (new `skill_types` table, contract
  changes in both vendored copies, ordered skill bodies into the prompt).
- 2026-09-19 → 21 — L01 run-cost (spec: server/specs/L01-run-cost.md), then the
  `pr-self-review` and `frontend-ui-architecture` skills; each skill's own
  `README.md` and `docs/pr-self-review.md` carry the design and contested calls.

## Open Questions
