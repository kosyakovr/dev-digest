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

- 2026-09-20 — Any read path keyed on `agent_runs` silently dies on a fresh
  local DB: `seed.ts` inserts NO `agent_runs` rows and its one review carries
  `run_id = NULL`, so re-pointing the PR list's FINDINGS column from "latest
  review" to "latest run" would have shown `—` on the seeded PR for every
  developer and every e2e run, with nothing broken to debug → give a run-keyed
  column an explicit fallback to the review-keyed source, and check what
  `seed.ts` actually inserts before assuming a table has rows. The same query
  also needs the case where a run exists but produced no review (every agent
  failed) — falling through to `0` there claims the PR is clean when nothing
  looked at it. (ref: server/src/db/seed.ts:136,
  server/src/modules/pulls/routes.ts:242)

- 2026-09-19 — A global markdown strip (``/[`*_>#]/g``) silently mangles code
  identifiers: flattening a finding's rationale for the PR-list preview turned
  the seeded `` `sk_live_` `` into "sklive", and would equally eat `=>` and
  `#482`. Every unit test passed, because the fixtures contained no code
  punctuation — only curling a freshly-seeded stack surfaced it → in a
  code-review tool strip LEADING block markers per line
  (`/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+)/gm`) plus `**` and backticks, and never
  strip `_`, `>` or `#` globally; and put a code-shaped string in the fixture.
  (ref: server/src/modules/pulls/status.ts:previewDescription)

## Codebase Patterns

## Tool & Library Notes

- 2026-09-20 — A `defaultNow()` timestamp CANNOT be used to tell which rows were
  created together: Postgres evaluates `now()` once per transaction, so N
  separate INSERTs get N distinct instants. `ReviewService.runReview` queues one
  `agent_runs` row per agent in a sequential loop, so the three agents of one
  review landed microseconds apart and any "group the runs of the last review by
  `ran_at`" query returned three batches of one — it looks correct in the schema
  and silently does nothing → when rows must share a batch timestamp, stamp ONE
  `new Date()` in the caller and pass it to every insert (keep the column default
  for single-row callers). Same trap applies to `eval_runs` / `ci_runs` /
  `multi_agent_runs`, which all carry `ran_at DEFAULT now()`.
  (ref: server/src/modules/reviews/service.ts:127,
  server/src/modules/reviews/repository/run.repo.ts:118)

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

- 2026-09-20 — L01-c run-level findings: `PrMeta.latest_findings` now sums every
  agent of the latest run (grouped by a shared `ran_at`), with a latest-review
  fallback and the preview cap at 30 (spec: server/specs/L01-findings-visibility.md).

- 2026-09-19 — L01-b findings visibility: added `PrMeta.latest_findings` (counts
  + capped read-only preview of the LATEST review) to `GET /repos/:id/pulls` in
  one extra IN-query (spec: server/specs/L01-findings-visibility.md).

## Open Questions
