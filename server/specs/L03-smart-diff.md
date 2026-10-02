# Smart Diff

**Status:** in-progress
**Lesson / ticket:** L03

Client side: [../../client/specs/L03-smart-diff.md](../../client/specs/L03-smart-diff.md).

## Goal
On the "Files changed" tab the PR's files are grouped by role in a fixed order
`core → tests → wiring → docs → boilerplate` (docs and boilerplate collapsed by
default), and the findings of the latest review are shown inside the diff.

## Non-goals
- No split-PR banner: `split_suggestion.too_big` is always `false`,
  `proposed_splits` always `[]`. (The Smart order / Original order toggle was
  added later, client-only — see
  [../../client/specs/L03-smart-diff.md](../../client/specs/L03-smart-diff.md).)
- `pseudocode_summary` is never populated (key absent).
- No LLM call; `assemblePrompt` and `run-executor.ts` are unchanged. The L08
  filter is not implemented — only its seam (`classifyFile`) exists.
- No DB schema change, no migration, no new dependency.

## Contract
`GET /pulls/:id/smart-diff` (reviews module). Params `IdParams`; 200
`SmartDiffResponse`; 404 `Pull request not found` for an unknown or
other-workspace PR; 422 for a non-uuid.

```ts
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']); // order = display order
export const SmartDiffResponse = SmartDiff.extend({ review_ids: z.array(z.string()) });
```

Example:
```json
{ "groups": [
    { "role": "core",  "files": [{ "path": "src/a.ts", "additions": 10, "deletions": 2, "finding_lines": [12, 30] }] },
    { "role": "boilerplate", "files": [{ "path": "pnpm-lock.yaml", "additions": 100, "deletions": 50, "finding_lines": [] }] } ],
  "split_suggestion": { "too_big": false, "total_lines": 162, "proposed_splits": [] },
  "review_ids": ["8f0c…"] }
```

### Data sources
`pr_files` (path, additions, deletions), the latest review set (`reviews`,
`findings`, `agent_runs`).

### Call sequence
`routes.ts` → `ReviewService.smartDiff(workspaceId, prId, logger)` → `getPull`
(404) → `getPrFiles` → `latestReviewSet` → drop dismissed → `buildSmartDiff`
(pure) → one `info` log line.

### Classifier
`classifyFile(path)` in `modules/reviews/smart-diff/helpers.ts`; rules in
`constants.ts`; checked in the order boilerplate → tests → wiring → docs, first
match wins, else `core`. `dist/`, `build/`, `e2e/`, `docs/`, `.github/`,
`.claude/` are anchored to the FIRST path segment. The table below is the
specification; `server/test/smart-diff-classify.test.ts` asserts it row for row.

| path | role | why (rule that wins) |
|---|---|---|
| `pnpm-lock.yaml` | boilerplate | lock basename |
| `server/pnpm-lock.yaml` | boilerplate | lock basename at any depth |
| `e2e/package-lock.json` | boilerplate | boilerplate checked before `e2e/` (tests) |
| `Cargo.lock` | boilerplate | `*.lock` |
| `dist/index.js` | boilerplate | root `dist/` |
| `build/out.js` | boilerplate | root `build/` |
| `src/build/plan.ts` | core | `build/` is root-anchored only |
| `src/__snapshots__/a.test.ts.snap` | boilerplate | `__snapshots__` beats `.test.` |
| `test/fixtures/x.snap` | boilerplate | `*.snap` beats `test/` |
| `src/api.generated.ts` | boilerplate | `*.generated.*` |
| `public/vendor.min.js` | boilerplate | `*.min.js` |
| `src/a.test.ts` | tests | `*.test.ts` |
| `src/A.test.tsx` | tests | `*.test.tsx` |
| `server/test/smart-diff.it.test.ts` | tests | `*.test.ts` covers `*.it.test.ts` |
| `src/a.spec.ts` | tests | `*.spec.ts` |
| `server/test/helpers/index.ts` | tests | `test/` dir beats the `index.ts` barrel (wiring) |
| `src/__tests__/util.ts` | tests | `__tests__/` dir |
| `e2e/specs/05-pr-diff.flow.json` | tests | root `e2e/` |
| `src/contest/foo.ts` | core | whole segment only, `contest` ≠ `test` |
| `src/tests.ts` | core | `tests` as a basename is not a dir |
| `client/src/vendor/shared/index.ts` | wiring | barrel |
| `lib/index.js` | wiring | barrel |
| `vitest.config.ts` | wiring | `*.config.*` |
| `client/next.config.mjs` | wiring | `*.config.*` |
| `tsconfig.json` | wiring | `tsconfig*.json` |
| `server/tsconfig.build.json` | wiring | `tsconfig*.json` |
| `.eslintrc.cjs` | wiring | `.eslintrc*` |
| `.env.example` | wiring | `.env*` |
| `docker-compose.dev.yml` | wiring | `docker-compose*.yml` |
| `.github/workflows/client.yml` | wiring | root `.github/` |
| `.claude/agents/planner.md` | wiring | root `.claude/` beats `*.md` (docs) |
| `src/app.environment.ts` | wiring | `*.environment.*` |
| `docs/index.ts` | wiring | barrel beats `docs/` |
| `README.md` | docs | `*.md` |
| `server/specs/L03-smart-diff.md` | docs | `*.md` |
| `docs/hand-written-migrations.md` | docs | `*.md` |
| `docs/diagram.png` | docs | root `docs/` |
| `CHANGELOG` | docs | `CHANGELOG*` |
| `LICENSE` | docs | `LICENSE*` |
| `readme.txt` | docs | `README*`, case-insensitive |
| `./src/x.ts` | core | leading `./` stripped |
| `server\src\a.ts` | core | `\` normalised to `/` |
| `server/src/modules/reviews/service.ts` | core | fallback |
| `client/src/app/layout.tsx` | core | fallback |

### Decisions (approved 2026-10-02)
- **G1** latest review set: the newest `agent_runs` batch for the PR (all runs
  with exactly the newest `ran_at`) → their `reviews` with `kind='review'`; if
  none, the single newest `kind='review'` review; if none, `review_ids = []`.
  Same semantics as the FINDINGS column of the PR list.
- **G2** findings with `dismissed_at` set are excluded; accepted ones stay.
- **G3** `review_ids` is an additive field.
- **Q1** the client shows `● N` (files with findings) in a group header always.
- `finding_lines` = unique `start_line` of findings whose `file` equals the
  path, ascending. Findings that match no PR path are dropped (counted in the log).

## Prompt builder
No LLM call; prompt assembly is unchanged. L08 seam:
`import { classifyFile } from './smart-diff/helpers.js'` inside
`server/src/modules/reviews/`; the folder is pure (no I/O).

## Logging
One `info` line `'smart-diff built'` with counts only (`prId`, `files`, `roles`,
`reviews`, `findings`, `dismissedExcluded`, `unmatchedFindings`,
`filesWithFindings`) — no paths, titles or finding text.

## Risks
- Rule order gives non-obvious roles (`docs/index.ts` → wiring, `.claude/**/*.md`
  → wiring, `server/dist/x.js` → core, `e2e/playwright.config.ts` → tests).
- Renamed files / findings on files not in the PR are not shown in the diff.
- `pr_files` is replaced on `GET /pulls/:id`; the client falls back to the flat
  list when the path sets differ.

## Acceptance criteria
- [ ] Groups come in order core, tests, wiring, docs, boilerplate; no empty groups.
- [ ] `finding_lines` from the latest batch only, no dismissed findings.
- [ ] A PR without `agent_runs` but with reviews → `review_ids = [newest review]`.
- [ ] Unknown uuid → 404; non-uuid → 422; other workspace → 404.
- [ ] `split_suggestion = {too_big:false, total_lines: Σ, proposed_splits:[]}`.
- [ ] Both vendored `brief.ts` and `review-api.ts` are byte-identical.
- [ ] `classifyFile` is unit-testable without `buildApp` and a DB.

## Test plan
Unit: `test/contracts.test.ts`, `test/smart-diff-classify.test.ts`,
`test/smart-diff-helpers.test.ts`. Integration (Docker):
`test/smart-diff.it.test.ts` — latest-batch selection, fallbacks, dismissed
exclusion, 404/422/tenancy.
