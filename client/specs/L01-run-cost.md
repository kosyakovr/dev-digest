# Run cost (per-run $ and per-PR total)

**Status:** draft
**Lesson / ticket:** L01

Cross-package feature — the canonical spec lives in
[`server/specs/L01-run-cost.md`](../../server/specs/L01-run-cost.md).

Client-side surfaces it covers — see the spec's **UI component map** for the
agreed, fixed placement. No new React components; three insertions plus one
formatter module:

- PR list — a left-aligned `Cost` column between `Score` and `Status`
  (`src/app/repos/[repoId]/pulls/constants.ts` → `GRID` + `COLUMN_KEYS`,
  `_components/PRRow` → one cell, `styles.ts` → `costCell`).
- PR detail → Agent runs timeline — `<total> tok · <cost>` under the run's
  timestamp (`_components/RunHistory/RunHistory.tsx:198-200`).
- Run trace drawer → Stats — a `COST` tile reusing the existing `Stat` atom
  (`_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:63-67`).
- New `src/lib/format.ts` (`formatCost`, `formatTokensTotal`). The drawer-local
  `formatTokens` stays as-is — different format, different surface.
