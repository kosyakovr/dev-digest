# Run cost (per-run $ and per-PR total)

**Status:** in-progress — implemented; migration `0010` applied in test, not yet
on any dev/prod database (`pnpm db:migrate`)
**Lesson / ticket:** L01
**Scope:** cross-package — `server/` (canonical spec), `client/`, vendored
`@devdigest/shared` contracts. `reviewer-core/` needs no change.

## Goal

Make the money a review costs visible where a reviewer already looks. Today the
dollar cost of a run is computed but thrown away: `reviewer-core` sums a real
per-call cost into `ReviewOutcome.costUsd`
(`reviewer-core/src/review/run.ts:216`), the server destructures everything
*except* cost (`server/src/modules/reviews/run-executor.ts:213`), and the
`agent_runs.cost_usd` column was dropped in migration `0009` (commit `d45ab0d`).

Three surfaces gain cost:

1. **PR list** (`/repos/:repoId/pulls`) — a new **Cost** column: the lifetime
   total this PR has spent on reviews.
2. **PR detail → Agent runs timeline** — each run row shows its token total and
   cost next to the timestamp (`9,119 tok · $0.0013`).
3. **Run trace drawer → Stats** — a fourth tile, `COST`, between `TOKENS` and
   `FINDINGS`.

## Non-goals

- The PR **brief** card (Overview tab) and its `$0.014 8.2K→1.3K` line.
- `MultiAgentRun.total_cost_usd`, `AgentStats`, `AgentPerfRow` — those contracts
  exist (`contracts/observability.ts`, `contracts/productionize.ts`) but have no
  server implementation; wiring them is separate work.
- Eval / CI cost (`eval_runs.cost_usd`, `ci_runs.cost_usd`) — already shipped,
  untouched.
- Budgets, alerts, cost-based sorting or filtering of the PR list.
- **Backfilling** cost for runs that predate this change. They stay `NULL` and
  render `n/a`; we do not retro-estimate from stored tokens, because a
  retro-estimate at today's prices is not what was actually paid.

## Decisions taken

| Question | Decision |
|---|---|
| Where cost lives | **Stored**: re-add `agent_runs.cost_usd`. `reviewer-core` already prefers OpenRouter's *real* `usage.cost` over an estimate (`reviewer-core/src/llm/openrouter.ts:107`), so the persisted number is what was actually billed and does not drift when the price book changes. |
| PR-list semantics | **Sum of every run on the PR**, all agents, all commits, all statuses — including failed and cancelled ones, because that money was still spent. |
| Formatting | **Adaptive**: `< $0.01` → 4 decimals (`$0.0013`); otherwise 2 (`$0.06`). One helper, all three screens. Sub-cent runs must never collapse to `$0.00`. Rounding is **half-up on the decimal value**, not `toFixed` alone — see below. |
| Unknown cost | **`n/a`** (tiles) / **`—`** (table cell). `null` means "we don't know", never `0`. This matches `estimateCost` returning `null` for unknown models (`server/src/adapters/llm/pricing.ts:37`) and the sticky-null accumulation in `reviewer-core/src/review/run.ts:184`. |

### Null semantics — the subtle part

`reviewer-core` treats `null` as **sticky** across a map-reduce run: if any
chunk's cost is unknown, the whole run's cost is `null`. SQL `SUM()` does the
opposite — it *skips* NULL rows and returns a total that silently understates.

Rule for the PR-list aggregate:

- `SUM(cost_usd)` over the PR's runs, ignoring NULL rows.
- If **no** run has a known cost (or the PR has no runs at all) → `null` → `—`.
- A partial sum (some runs known, some not) is returned **as a plain number**.
  We accept the understatement rather than add a `cost_partial` flag to the
  contract; the per-run breakdown on the PR detail page shows which runs are
  `n/a`.

Pre-LLM failures (quota errors, cancellation before the first call) write
`costUsd: null`, **not** `0` — `0` would read as "this run was free".

### Rounding — the other subtle part

`toFixed` rounds the **binary** value, not the decimal one it appears to be:
`(1.005).toFixed(2)` is `"1.00"`, `(0.145).toFixed(2)` is `"0.14"`, and
`(8.475).toFixed(2)` is `"8.47"` — all a cent short. The PR-list total makes
this concrete, because a Postgres `SUM()` over `double precision` hands the
client values like `0.012000000000000002`.

`formatCost` therefore rounds through a `roundTo(n, digits)` helper that scales
the number, re-reads it at 12 significant digits to shed the representation
noise, then rounds half-up. It applies to **both** precision branches: the
sub-cent branch has the identical flaw, and splitting the behaviour would be
arbitrary.

## Contract

### DB

```ts
// server/src/db/schema/runs.ts — agentRuns, next to tokensOut
costUsd: doublePrecision('cost_usd'),   // nullable; NULL = unknown, never 0
```

`double precision` matches the column's original definition
(`migrations/0000_init.sql:12`) and the surviving `eval_runs` / `ci_runs`
columns. New migration `0010` = `ALTER TABLE "agent_runs" ADD COLUMN
"cost_usd" double precision;` plus its Drizzle snapshot and journal entry.

> **Gate (cleared 2026-09-19):** migrations are on the do-not-touch list in the
> root `CLAUDE.md`. The user approved adding the column. `0010` was written **by
> hand** — `pnpm db:generate` stays forbidden by name, and hand-writing also
> avoids sweeping up unrelated schema drift: `0010_snapshot.json` is
> `0009_snapshot.json` with a new `id`/`prevId` and exactly one added column,
> verified by diffing the two. Applying it to a real database is still a
> separate `pnpm db:migrate` step.

### Zod contracts — change in **both** `server/src/vendor/shared` and `client/src/vendor/shared`

```ts
// contracts/trace.ts — RunStats (drawer Stats tiles)
cost_usd: z.number().nullable(),

// contracts/trace.ts — RunSummary (timeline run rows)
cost_usd: z.number().nullable(),

// contracts/platform.ts — PrMeta (PR list rows; list endpoint only, like `score`)
cost_usd: z.number().nullish(),
```

### HTTP

| Route | Change |
|---|---|
| `GET /repos/:id/pulls` | each `PrMeta` gains `cost_usd` — the PR's lifetime run-cost total |
| `GET /pulls/:id/runs` | each `RunSummary` gains `cost_usd` |
| `GET /runs/:id/trace` | `stats.cost_usd` restored |

### UI component map

**No new React components.** Three insertions into existing ones, plus one new
module of pure functions. Agreed with the user before implementation — treat
this map as fixed.

**New file — `client/src/lib/format.ts`** (pure; no React, no i18n)

```ts
/** Adaptive USD. Sub-cent runs keep 4 decimals so they never read "$0.00".
    Returns null for "unknown" — the caller supplies the placeholder, because
    that is a UI string and client/CLAUDE.md keeps those in messages/. */
export function formatCost(usd: number | null | undefined): string | null;
/** Run token total, e.g. "9,119 tok". */
export function formatTokensTotal(tokensIn: number | null, tokensOut: number | null): string | null;
```

The drawer-local `formatTokens` (`RunTraceDrawer/helpers.ts:26`) stays untouched
— it renders the in→out shape `12k→1.5k` for the TOKENS tile, a different
format from the timeline's total.

**1 — PR list Cost column.** Position: **after Score, before Status**.
Alignment: **left**, like the other middle columns — the shared
`s.headCell(alignRight)` helper right-aligns only the last column, and cost is
not it, so the helper is not touched.

| File | Change |
|---|---|
| `pulls/constants.ts:27` | `GRID` gains an `84px` track in 5th position |
| `pulls/constants.ts:42-49` | `COLUMN_KEYS` gains `"cost"` after `"score"` |
| `pulls/styles.ts` | new `costCell` (`fontSize: 12`, `--text-secondary`) |
| `pulls/_components/PRRow/PRRow.tsx:55` | new cell between the score cell and the status badge |
| `messages/en/prReview.json` | `list.columns.cost = "Cost"` |

```tsx
<div className="tnum" style={s.costCell}>
  {formatCost(pr.cost_usd) ?? <span style={s.muted}>—</span>}
</div>
```

`page.tsx` (header row) needs no edit — it maps over `COLUMN_KEYS`, and both
`s.row` / `s.headRow` read `GRID`. Side effect: the `1fr` title column loses
~98px and its existing ellipsis truncates slightly earlier.

**2 — Timeline run row.** `RunHistory.tsx:198-200`, the right-hand flex column
that currently holds only the timestamp gains a second line:
`9,119 tok · $0.0013`. Gated on the existing `settled` flag, so running rows
show nothing. If cost is unknown the line degrades to tokens only — no `n/a`
here, which also avoids adding a key to the `prReview` namespace.

**3 — Stats tiles.** `TraceBody.tsx:63-67`, one more `<Stat>` between TOKENS and
FINDINGS, reusing the existing `Stat` atom (`_components/atoms.tsx:6`, already
`.tnum`). `statsRow` is a `flex, gap: 10` — no style change for a fourth tile.

```tsx
<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd) ?? t("stats.na")} />
```

New key `trace.stat.cost = "COST"` in `messages/en/runs.json`; `stats.na = "n/a"`
already exists there.

**Explicitly untouched:** `ReviewRunAccordion`, the Overview brief card, and the
`AgentPerf` surfaces.

## Acceptance criteria

- [ ] A completed review run persists `cost_usd` and it survives a reload.
- [ ] A run whose model is absent from the price book persists `NULL`, and every
      surface renders `n/a` / `—` — not `$0.00`.
- [ ] A run that fails before any LLM call persists `NULL`.
- [ ] PR list shows a Cost column equal to the sum of that PR's runs; a PR with
      no runs shows `—`.
- [ ] Timeline run rows show `<total> tok · <cost>` for settled runs; running
      rows show neither.
- [ ] Trace drawer Stats shows a `COST` tile in third position.
- [ ] `$0.0013` renders with 4 decimals, `$0.06` with 2, `$0` renders `$0.00`.
- [ ] Half-way values round UP, not down: `1.005 → $1.01`, `0.145 → $0.15`.
- [ ] Runs created before migration `0010` render `n/a` everywhere and break
      nothing.
- [ ] PR list stays a single extra query — no N+1 over `agent_runs`.

## Test plan

Per [TESTING.md](../../TESTING.md) — behaviour at the seams, not coverage.

**server-unit**
- `server/test/contracts.test.ts:157` — restore `cost_usd` in the `RunTrace`
  fixture (the commit that removed cost edited this exact line).
- `run-executor` writes `outcome.costUsd` into `completeAgentRun` and into
  `RunTrace.stats`; the failure paths write `null`.

**server-integration** (`*.it.test.ts`, real Postgres)
- Run lifecycle: complete a run → `GET /runs/:id/trace` returns `stats.cost_usd`
  and `GET /pulls/:id/runs` returns it per row.
- Pulls route: two runs on one PR (one with cost, one `NULL`) → the list returns
  the sum of the known one; a PR with no runs returns `null`.

**client** (vitest + RTL, jsdom)
- `format.test.ts` — the boundary table: `null → "n/a"`, `0 → "$0.00"`,
  `0.0013 → "$0.0013"`, `0.06 → "$0.06"`, `12.5 → "$12.50"`.
- `RunHistory.test.tsx` — fixture gains `cost_usd`; row renders tokens + cost;
  a `null` row renders `n/a`.
- `RunTraceDrawer.test.tsx` — `TRACE` fixture gains `cost_usd: 0.06`; the `COST`
  tile renders.
- PR list — header renders `Cost`; a row with an aggregate renders it, a row
  without renders `—`.

**e2e web**
- `e2e/specs/02-repo-pulls-detail.flow.json` — one `wait --text "Cost"` after
  landing on the list. Header text only: `server/src/db/seed.ts` seeds no
  `agent_runs`, so the seeded PR's cell is `—` and any value assertion would be
  non-deterministic.

## Implementation order

0. **Gate** — confirm migration `0010` may be generated.
1. **Server persistence** — schema column, migration `0010`, `run-executor.ts`
   (stop dropping `outcome.costUsd`; all four write paths), `run.repo.ts`
   (`completeAgentRun` signature + `listRunsForPull` mapping),
   `repository.ts:155` facade type.
2. **Contracts** — `RunStats`, `RunSummary`, `PrMeta` in both vendored copies,
   kept byte-identical.
3. **PR-list aggregate** — a grouped `sum(costUsd)` query over `agentRuns`
   beside the existing latest-score query in `server/src/modules/pulls/routes.ts`,
   then map into the response.
4. **Client** — `lib/format.ts`; then the three screens (PR list `GRID` +
   `COLUMN_KEYS` + `PRRow` cell + `prReview.json`; `RunHistory` row;
   `TraceBody` tile + `runs.json` `trace.stat.cost`).
5. **Tests + docs** — the plan above, then update any README/docs that describe
   the run trace or the PR list columns.
