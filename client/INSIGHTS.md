# Insights — client

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

- 2026-09-19 — `overflow: hidden` clips absolutely-positioned descendants but
  NOT `position: fixed` ones, so a hover popover inside the PR list's
  `s.tableCard` (which is `overflow: hidden`) needs no portal — `createPortal`
  appears nowhere in this codebase, and `kit/Modal.tsx` is the fixed-position
  precedent → position such a panel `fixed` from `getBoundingClientRect()` in a
  `useLayoutEffect`, after checking no ancestor creates a containing block
  (`transform`/`filter`/`will-change`/`contain` — `AppFrame`, `AppShell`,
  `layout.tsx` and `globals.css` currently do not). The cost is that it does not
  follow the scroll container, so close it on `scroll` (capture) and `resize`.
  (ref: client/src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx)

## What Doesn't Work

- 2026-09-19 — Rendering a number and its label as two adjacent JSX elements
  (`<span>{count}</span>{label}`) yields a `textContent` of "2Critical" with NO
  space — flex `gap` fakes the space visually, so it looks right and is still
  unmatchable by `getByText("2 CRITICAL")` or agent-browser's `wait --text` →
  when a string must be assertable, put the number and its word in ONE i18n
  message (`"{count} CRITICAL"`) and make the casing part of the message, not a
  `textTransform`. (ref: client/src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterBar/constants.ts)

- 2026-09-20 — That one-message trick has no purchase where the design shows no
  word at all: `SeverityBadge` with `compact` renders an icon and a bare digit
  (`{compact ? null : s.label}`, Badge.tsx:80), so the timeline's counters are
  three sibling nodes whose whole text is "2", "1", "3" — `getByText` cannot
  tell them apart and there is nothing for `wait --text` to match → wrap each in
  a `role="img"` span carrying the SAME `"{count} CRITICAL"` message as its
  `aria-label` (role="img" makes AT read the label instead of the digit), and
  assert with `getByLabelText` / agent-browser `find label`.
  (ref: client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:104)

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

- 2026-09-20 — Timeline severity counters: the Agent-runs timeline row now
  reports findings per severity instead of one total, tallied from the reviews
  the page already holds (spec: client/specs/L01-findings-visibility.md).

- 2026-09-19 — L01-b findings visibility: severity counters + filter in the run
  card, a hover popover on the PR list, and a shared read-only `FindingPreview`
  reused by the trace drawer (spec: client/specs/L01-findings-visibility.md).

## Open Questions
