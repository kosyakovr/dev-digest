# Smart Diff (client)

**Status:** in-progress
**Lesson / ticket:** L03

One spec for the feature:
[../../server/specs/L03-smart-diff.md](../../server/specs/L03-smart-diff.md)
(goal, contract, classifier, decisions). This file records only what is
client-specific.

## UI surface
- **Files changed tab (`DiffTab`)** groups files by server-provided role in the
  order core, tests, wiring, docs, boilerplate. `RoleGroup` header is a button
  (`aria-expanded`): chevron, role label, `● N` (files with findings, shown
  always when N>0, `aria-label` "N files with findings"), "N files". Docs and
  Boilerplate start collapsed.
- **States:** loading → `Skeleton`; smart-diff error or path-set mismatch → flat
  `DiffViewer` without findings + a muted note; no review yet → muted note.
- **File card** shows a dot ("Has findings") next to the GitHub comment counter.
- **Line:** several findings on one line → stripe and label button (worst
  severity, `aria-expanded`) and ALL cards stacked below, sorted by severity,
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
