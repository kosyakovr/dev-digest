# Insights — e2e

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

- 2026-09-19 — `server/src/db/seed.ts` inserts NO `agent_runs` rows (it seeds
  workspaces, users, settings, repos, pulls, files, commits, reviews, findings
  and agents only), so every run-derived surface — run history, duration,
  tokens, cost, the PR list's run aggregates — is empty on a fresh seed → assert
  a column or section HEADER (`wait --text "Cost"`), never a value; a value
  assertion either fails or, worse, passes only against a dirty local DB.
  (ref: server/src/db/seed.ts:39-220)

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
