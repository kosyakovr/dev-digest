# Smart Diff (client)

**Status:** in-progress
**Lesson / ticket:** L03

One spec for the feature:
[../../specs/L03-smart-diff.md](../../specs/L03-smart-diff.md)
(goal, contract, classifier, decisions). This file records only what is
client-specific.

## UI surface
- **Toolbar (`DiffToolbar`)** above the diff: "N files · +A −D" from the PR-level
  `files_count` / `additions` / `deletions` (GitHub's totals, so they cover
  every file even when `files` is capped), and a Smart order / Original order
  toggle (`role="group"` "File order", buttons with `aria-pressed`; Smart order
  by default, not persisted). Original order is the flat `DiffViewer` in the
  PR's own file order; its files do not wait for the smart diff and it never
  shows the "unavailable" grouping notice.
- **Findings come from the smart diff in both orders:** the cards are the
  findings of the reviews in `review_ids`, so none render until the smart diff
  has loaded. Once it has, they render under their line in either order. When
  it failed with no data, a muted note under the toolbar says findings are
  unavailable, in both orders (`smartDiff.findingsUnavailable`); a failed refresh that kept stale data keeps
  showing the findings of those stale `review_ids`.
- **Smart order (`DiffTab`)** groups files by server-provided role in the
  order core, tests, wiring, docs, boilerplate. `RoleGroup` header is a button
  (`aria-expanded`): chevron, role label, `● N` (files with findings, shown
  always when N>0, `aria-label` "N files with findings"), "N files". Docs and
  Boilerplate start collapsed.
- **States (Smart order):** loading → `Skeleton`; smart-diff error or path-set
  mismatch → flat `DiffViewer` + the muted "unavailable" note — with findings
  on a path-set mismatch (the data and its `review_ids` are there), without
  them on an error with no data; no review yet → muted note (in both orders).
- **File card** shows a dot ("Has findings") next to the GitHub comment counter.
- **Line:** several findings on one line → stripe and a badge button on the
  right (severity icon + text of the WORST severity: CRITICAL "Blocker", WARNING
  "Warning", SUGGESTION "Suggestion"; outlined and tinted while the cards are
  open, `aria-expanded`) and ALL cards stacked below, sorted by severity,
  `start_line`, `end_line`, `id`. Findings without a rendered line appear under
  "Findings outside the visible diff" at the top of the file card.
- **`InlineFinding`** is a simplified copy of the route-local `FindingCard`
  (Accept / Dismiss only); colours only via `SEV` / `SeverityBadge`.

## Data
`lib/hooks/reviews.ts`: `useSmartDiff` (query `["smart-diff", prId]`),
invalidated together with `["reviews", prId]`.

## i18n
`messages/en/shell.json` (`diffViewer.*`), `messages/en/prReview.json` (`smartDiff.*`).

## Test plan
`findings.test.ts`, `FileCard`, `CodeLine`, `InlineFinding`, `DiffTab/helpers`,
`DiffTab` tests — written by test-writer from the server spec's brief.
