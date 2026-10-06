# Lesson log

What each lesson session built, newest first — one line per session, with its
spec. Moved here from the root `INSIGHTS.md` § Session Notes on 2026-10-05 (that
file is `@import`ed into every session; this history is not needed there).
Spec paths are the current ones: cross-package specs moved from
`server/specs/` to `docs/specs/` on 2026-10-03, then to the root `specs/` on 2026-10-06.

## Before designing a lesson feature

The course author's own implementation of each lesson is in this repo's
history, **reverted** (`c6af1e4` "homework belongs in forks" rolled back
`641b637` "feat(conventions): …"), so it is unreachable from `main` and
`git log` on its deleted paths shows nothing. Run
`git log --all --grep '<feature>'` (or `--diff-filter=D`) first: the commit
message carries measured findings, and `docs/specs/conventions.md` there is a
full design doc. It will not cherry-pick (different base), but it names the
traps — e.g. a structured response's FIELD ORDER is generation order, so
`category` placed first collapsed a live scan to one category and a flat 0.90
confidence. Tell the user when you use it: it is someone else's homework.
`spec-creator`, `brainstormer` and `implementation-planner` run this search.

## Sessions

- 2026-10-05 — SDD workflow hardening: `docs/plans/`, spec/plan `approved`
  status, guards (implementer: no specs/plans/tests/INSIGHTS by any write),
  plan-verifier Spec coverage, `scripts/review-record.sh` lets `/pr-self-review`
  skip covered groups, `change-set.sh` racy-index fix, test-writer split into
  T1 (acceptance tests before the implementer) and T2; package traps moved from
  the root `INSIGHTS.md` into package docs (spec: none — `.claude/` tooling, see
  `.claude/agents/README.md`).
- 2026-10-02 — L04 Blast radius: `GET /pulls/:id/blast` + `/history` (module
  `blast/`), repo-intel facade fixed (per-symbol cap, reasons, hop 2, no clone
  reads), contracts in both vendored copies, Overview card, MCP
  `get_blast_radius` (spec: [specs/L04-blast-radius.md](../specs/L04-blast-radius.md)).
- 2026-10-02 — L04 MCP server: new pnpm package `mcp-server/` (stdio, 5 tools,
  thin HTTP client, onion by analogy routed via pr-self-review group A), verbatim
  tool descriptions pinned by tests, SR-1 quoted locations
  (spec: [mcp-server/specs/L04-mcp-server.md](../mcp-server/specs/L04-mcp-server.md)).
- 2026-10-02 — L03 Smart Diff: path-only `classifyFile` + `GET /pulls/:id/smart-diff`
  (no migration, `SmartDiffRole` widened to 5 in both vendored copies), role
  groups and inline findings on Files changed (spec: [specs/L03-smart-diff.md](../specs/L03-smart-diff.md)).
- 2026-10-01 — L03 Intent Layer: cheap-model PR intent (migration 0013 on
  `pr_intent`, contracts in both vendored copies, `## Stated intent` review slot,
  one live call at $0.00013) (spec: [specs/L03-intent-layer.md](../specs/L03-intent-layer.md)).
- 2026-09-24 — L02 subagents: test-writer, plan-verifier, architecture-reviewer,
  doc-writer + `agent-scope-guard.sh`; tests moved from implementer to test-writer
  (design and sources: `.claude/agents/README.md`).
- 2026-09-23 — L02 conventions: cross-package feature (migration 0012 extending
  `conventions`, contracts in both vendored copies, a `SKILLS LAB` nav section,
  one live scan at $0.0029) (spec: [specs/L02-conventions.md](../specs/L02-conventions.md)).
- 2026-09-22 — L02 skills: cross-package feature (new `skill_types` table,
  contract changes in both vendored copies, ordered skill bodies into the
  prompt) (spec: [specs/L02-skills.md](../specs/L02-skills.md)).
- 2026-09-22 — L01 follow-up: per-run dollar cost plumbed end to end —
  `agent_runs.cost_usd` back (`0010_add_agent_run_cost.sql`, `schema/runs.ts`),
  `run-executor` persists `ReviewOutcome.costUsd`; the column was absent between
  `d45ab0d` and L01, so older designs assuming it missing are stale.
- 2026-09-19 → 21 — L01 run-cost (spec: [specs/L01-run-cost.md](../specs/L01-run-cost.md)),
  then the `pr-self-review` and `frontend-ui-architecture` skills; each skill's
  own `README.md` and `docs/pr-self-review.md` carry the design and contested calls.
