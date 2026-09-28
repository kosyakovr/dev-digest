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

> **Consolidated 2026-09-22, -23, -24, -26 and -28** with the user's approval; settled
> knowledge moved to docs and the `.claude/*/README.md` files, no finding dropped.
> Prior text, incl. old Session Notes: `git show <sha>:INSIGHTS.md` — 438513f, 79836e0, 916ddb4.

## What Works

- 2026-09-23 — The course author's own implementation of each lesson is in this
  repo's history, REVERTED (`c6af1e4` rolled back `641b637`), so it is
  unreachable from `main` → before designing a lesson feature run
  `git log --all --grep '<feature>'` (or `--diff-filter=D`): its commit message
  and `docs/specs/*.md` name the traps. It will not cherry-pick (different base).
  Tell the user when you use it: it is someone else's homework.

## What Doesn't Work

- 2026-09-26 — `main` is frozen at the revert `c6af1e4`, so a `lessons/*` branch
  diffed against it carries EVERY lesson so far: a full `/pr-self-review` of
  `lessons/l03-homework` was 353 files → 13 reviewer chunks, ~1.75M sub-agent
  tokens and ~1 h, 3× the budget in the skill's SKILL.md → tell the user the file count
  and that cost BEFORE fanning out, and offer a narrower base. (ref:
  .claude/skills/pr-self-review/SKILL.md § 4 Cost)

- 2026-09-26 — A VALUE import from `@devdigest/shared` in `client/` breaks the
  Next.js build (webpack cannot resolve its `./contracts/*.js` re-exports; `next
  dev` then 500s like cache corruption) while typecheck and vitest stay green →
  `client/` uses `import type` only, runtime constants stay local (the server may
  import values). (ref: client/src/vendor/shared/index.ts:17)

- 2026-09-24 — Writing a markdown file through a Bash heredoc (or `python3 - <<EOF`)
  gets DENIED by the pr-self-review gate whenever the prose merely mentions a
  push, e.g. a table cell quoting the command: the gate regex-tests the whole
  command string before anything else, heredoc body included, and here reported
  a stale report instead of the real cause → write file content with the
  Write/Edit tools; keep Bash for commands. (ref: .claude/hooks/pr-self-review-gate.mjs)

- 2026-09-20 — Do NOT create a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`:
  any one of them (even untracked) silently drops EVERY `AGENTS.md` — root and
  all four packages — under the default `instructionFiles` mode; the settings
  meant to keep both were NO-OPs on 2.1.278 (unverified since; now 2.1.283).
  (ref: .claude/settings.json:2)

- 2026-09-19 — A shared Zod contract does NOT imply a route serves it (rule in
  `.claude/agents/planner.md` Step 2) — unserved today: `AgentColumn.cost_usd`,
  `MultiAgentRun.total_cost_usd`, `AgentStats` (contracts/observability.ts:46,82,108),
  `AgentPerfRow` / `AgentPerf.summary` (contracts/productionize.ts:152,177).

## Codebase Patterns

## Tool & Library Notes

- 2026-09-26 — The Bash tool's shell is **zsh**: an unquoted `$var` is NOT
  word-split, so `sh $rest` with `rest="guard.sh read-only"` runs a file named
  `guard.sh read-only`, gets no output, and a hook comparison read every case as
  "allow" → run such loops under `bash -c '…'`, or quote each argument separately.

See also — settled recipes, one line each:
- Cost is the stored `agent_runs.cost_usd`, NULL = unknown (not 0) → `server/specs/L01-run-cost.md` § Null semantics.
- A migration without `pnpm db:generate` → `docs/hand-written-migrations.md` (proven on 0011, 0012).
- A hook exiting non-zero FAILS OPEN; answer `ask` + exit 0 → `.claude/hooks/README.md` § The `node` resolution problem.
- Group E's content trigger must keep a file's F route → `.claude/skills/pr-self-review/routing.md` § Group E's content trigger.
- Testing a hook end to end → `.claude/hooks/README.md` § Testing a hook end to end.
- A FRESH headless session (`"$CLAUDE_CODE_EXECPATH" -p`) → `.claude/agents/README.md` § Changing an agent.
- Authoring a skill (PyYAML, `skills-lock.json`) → `.claude/skills/README.md` § Authoring a skill in this repo.

## Recurring Errors & Fixes

- 2026-09-26 — Hook tests that could NOT fail: silence asserted against a PASSING
  report, and a `"` in `run '…'` making the JSON unparseable (the hook is silent
  either way) → assert silence only against a FAILING report, write `"` as `\"`,
  and prove each new case red against `git show HEAD:<hook>` before trusting it.
  (ref: .claude/hooks/test-gate.sh:72)

- 2026-09-20 / -21 / -28 — Patterns shipped unrun, or run so a failure read as a
  pass: a BRE backreference in `grep` (here **ugrep**) dies non-zero; §15's
  `fetch(` matched `refetch()`; an e2e flow command that does not exist
  (`e2e/INSIGHTS.md` 2026-09-22); `git grep -nE "$pat" | wc -l` counted
  `-----BEGIN …` — read as an option, exit 129 — as "0 hits" → treat every
  pattern and flow as untested code: run it, pass it with `-e`, no
  backreferences, exit ≥2 = broken, prove each 0 with a planted positive, and
  ship its EXPECTED output beside it (`greps.md` § The patterns, `scripts/secret-greps.sh`).

## Session Notes

- 2026-09-28 — L04 lab: brainstormer + security-reviewer agents (plan, research
  sources, G9 probes: .claude/agents/README.md § Where the rules come from).

## Open Questions
