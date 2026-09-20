# Findings visibility (severity counters, filter, PR-list popover)

**Status:** implemented
**Lesson / ticket:** L01-b

Cross-package feature — the canonical spec lives in
[`server/specs/L01-findings-visibility.md`](../../server/specs/L01-findings-visibility.md).

Client-side surfaces it covers — see the spec's **UI component map** for the
agreed placement:

- **PR list** — a `Findings` column between `Score` and `Cost`
  (`src/app/repos/[repoId]/pulls/constants.ts` → `GRID` + `COLUMN_KEYS`,
  `styles.ts` → `findingsCell`), whose cell is the new
  `_components/FindingsCell/`: one compact `SeverityBadge` per severity present,
  plus a hover popover titled "N FINDINGS IN THIS RUN".
  **Amended 2026-09-20 (L01-c):** that run is now the whole latest run — every
  agent of it — rather than the single latest review. The component itself did
  not change: the server sums the agents' findings into the same
  `PrFindingsRollup`, so the counters and the popover render it unmodified. What
  did change is what they mean, plus the popover's cap (5 → 30) and its
  consequence that "+N more on the PR page" now rarely appears.
- **New `src/components/finding-preview/`** — the read-only finding rendering
  shared by that popover and the trace drawer. Two constraints are load-bearing:
  it renders **no** interactive element (not even `MonoLink`, which is an
  `<a>`/`<button>`), and it calls **no** `useTranslations`, so both host
  surfaces can render it without widening their message namespaces.
- **PR detail → Agent runs → Review runs** — new
  `_components/SeverityFilterBar/` at the top of `FindingsPanel`, so it sits
  under `VerdictBanner` (verdict + PR SCORE) and above the finding cards, with
  no prop drilling. `FindingsPanel` owns the `severity` state;
  `countBySeverity` / `filterBySeverity` live in its `helpers.ts`.
- **PR detail → Agent runs → Timeline** — `_components/RunHistory/` replaces the
  aggregate `N finding(s)` on a settled run row with `RunFindings`: one compact
  `SeverityBadge` per severity present, then the unchanged `· N blockers`. The
  numbers are NOT on `RunSummary` (`agent_runs` denormalizes only the total);
  `FindingsTab` tallies them from the reviews the page already holds, keyed by
  `run_id`, so the row costs no request. No breakdown for a run — its review was
  deleted, or every finding carries an off-enum severity — falls back to the
  aggregate line rather than showing nothing.
- **Run trace drawer** — `_components/RunTraceDrawer/_components/FindingsSection`
  now renders `FindingPreview`, gaining category + confidence and dropping its
  local `SEV_COLOR` (whose `SUGGESTION: var(--accent)` disagreed with every
  other surface).
- `FindingCard` gains one attribute, `data-severity`, beside the existing
  `data-finding-id` — it is how the tests assert "counter == cards below".

Removed: the unused `PrRowView` from `src/lib/types.ts`, whose `findings` field
was the prototype of what is now `PrMeta.latest_findings`.

## Gotchas worth keeping

- The timeline's counters are `SeverityBadge … compact`, which renders an icon
  and a bare digit — no word. Each one is therefore wrapped in a
  `role="img"` + `aria-label` span carrying the shared `"{count} CRITICAL"`
  message, so screen readers and `getByLabelText` see the full phrase. It is
  the only surface where the counter's text is NOT the assertable string.
- Not e2e-covered: `server/src/db/seed.ts` inserts no `agent_runs` rows, so a
  freshly-seeded timeline shows commits and no run row at all.

- (L01-c) The popover can list the SAME finding twice, because two agents of
  one run often report one issue. That is deliberate — deduplicating would make
  the counter above disagree with the rows below it — so assertions on the
  popover's contents need `getAllByText`, not `getByText`.
- (L01-c) The panel was already `maxHeight: 360` + `overflowY: auto`, so the
  raised cap needed no layout work; it just scrolls further.

- The popover panel is `position: fixed` (the list's `tableCard` is
  `overflow: hidden`, which clips absolute but not fixed descendants), so no
  portal — and it closes on scroll, because a fixed panel does not follow the
  scroll container.
- Counter labels are uppercase **in the message** and count+word live in ONE
  message, so the node's text is literally `2 CRITICAL`. Two adjacent spans
  would render as `2Critical` in `textContent` — invisible to a text locator.
- `@testing-library/user-event` is not a dependency; hover tests use
  `fireEvent.mouseEnter/mouseLeave`, and the popover's close delay needs
  `act(() => vi.advanceTimersByTime(...))` to flush.
