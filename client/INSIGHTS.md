# Insights — client

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

- 2026-09-19 — `toFixed(2)` is NOT decimal rounding and quietly shows money a
  cent short: it rounds the binary value, so `(1.005).toFixed(2)` is "1.00",
  `(0.145).toFixed(2)` is "0.14" and `(8.475).toFixed(2)` is "8.47". Costs make
  this visible because a Postgres `SUM()` over `double precision` yields values
  like 0.012000000000000002 → round through `roundTo()` in `src/lib/format.ts`
  (scale, re-read at 12 significant digits, `Math.round`) before formatting any
  currency. (ref: client/src/lib/format.ts:9)

- 2026-09-19 — Editing `messages/en/*.json` by loading + re-dumping the JSON
  reformats pre-existing lines: `runs.json` had a hand-indented `"copied"` key
  that a rewrite silently "fixed", polluting the diff with a change nobody asked
  for → add i18n keys with a targeted `Edit`, or re-dump and then restore the
  untouched lines; always read `git diff -- messages/` before moving on.
  (ref: client/messages/en/runs.json:71)

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
