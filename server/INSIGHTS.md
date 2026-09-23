# Insights — server

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- 2026-09-19 — drizzle-kit names migrations randomly, so a column that vanished
  from `src/db/schema/` leaves no searchable trace: `0009_complex_runaways.sql`
  is what dropped `agent_runs.cost_usd`, and grepping `src/` for `cost_usd`
  returns only unrelated tables (`eval_runs`, `ci_runs`) plus snapshot JSON →
  when a field is referenced by old code, contracts or a design but missing from
  the schema, run `git log -p --reverse -- src/db/migrations/*.sql` (or
  `git log -1 --format=%B $(git log -1 --format=%H -- <migration>)`) to find the
  commit and its stated reason before assuming it never existed.
  (ref: server/src/db/migrations/0009_complex_runaways.sql:1 / commit d45ab0d)

## Recurring Errors & Fixes

## Session Notes

## Open Questions
