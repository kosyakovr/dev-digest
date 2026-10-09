# `@devdigest/shared` contracts

The Zod contracts shared by the server and the client are **vendored twice**:
`server/src/vendor/shared/` and `client/src/vendor/shared/`. They change
together, in the same change (root `AGENTS.md` § Cross-package invariants);
`/pr-self-review` and `architecture-reviewer` flag a one-sided edit.

The check is `diff -r server/src/vendor/shared client/src/vendor/shared`: it
prints nothing when the twins are byte-identical, which they are as of L05 (five
client files had drifted behind the server and were re-synced then; the L05
contracts `ContextItem`, `ContextPaths`, `AgentContext`, `ContextSources` and
`ProjectContextEntry` were added to both).

## A schema is not a route

A schema in `*/src/vendor/shared/contracts/` does **not** mean a server route
returns it. These have no server implementation at all — grepping their names
hits only the contract file (checked 2026-09-19):

| Contract | File |
|---|---|
| `AgentColumn.cost_usd` | `contracts/observability.ts` |
| `MultiAgentRun.total_cost_usd` | `contracts/observability.ts` |
| `AgentStats` | `contracts/observability.ts` |
| `AgentPerfRow`, `AgentPerf.summary` | `contracts/productionize.ts` |

Before building UI or estimating work against a shared contract, confirm that a
route registered in `server/src/modules/` actually returns it
(`grep -rnE "app\.(get|post|put|patch|delete)\(" server/src/modules/`).
`spec-creator` (Step 1) and `implementation-planner` (Step 2) do this check.

## Cost fields: null is "unknown", never 0

Run cost is stored per run in `agent_runs.cost_usd` — read the stored value,
never re-derive it. `reviewer-core` treats `null` as sticky "unknown", while a
plain SQL `SUM(cost_usd)` skips NULL rows and silently understates the total.
The aggregation rule is in `specs/L01-run-cost.md` § Null semantics.

Moved here from the root `INSIGHTS.md` (entries of 2026-09-19 and 2026-09-22) on 2026-10-05.
