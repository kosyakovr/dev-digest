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

- 2026-09-19 — `agent-browser` is an external, globally-installed binary, NOT a
  dependency in `package.json`, so on a machine without it `./scripts/e2e.sh`
  brings the whole stack up, prints `0/7 flows passed` with every step failing
  `spawn agent-browser ENOENT`, and still **exits 0** — which reads exactly like
  "I broke all seven flows" → check `command -v agent-browser` before believing
  a mass failure (the script only `warn`s about it, near the top of its output,
  far from the summary); install once with `npm i -g agent-browser &&
  agent-browser install`, and meanwhile verify flow edits with `npm run
  typecheck` plus a JSON parse. (ref: scripts/e2e.sh:51)

- 2026-09-19 — The command vocabulary has no HOVER verb (`open`, `wait
  --url|--text|--load`, `find role|text|label … click`), and no negative text
  assertion either → a hover-only surface such as the PR list's findings popover
  cannot be covered here at all; assert its trigger's neighbouring column header
  instead and keep the behaviour in a vitest test, and say so in the flow's
  `label` so the gap is visible to the next reader. (ref: e2e/README.md)

## Recurring Errors & Fixes

## Session Notes

- 2026-09-19 — L01-b findings visibility: extended flows 02 (findings column
  header) and 04 (severity counter pills + filter toggle); both unexecuted here
  because `agent-browser` is not installed on this machine.

## Open Questions
