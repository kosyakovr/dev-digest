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

## Recurring Errors & Fixes

## Session Notes

- 2026-09-19 — L01 run-cost: spec-only session; mapped the previously removed
  per-run cost end-to-end before any implementation
  (spec: server/specs/L01-run-cost.md).

## Open Questions
