# Blast radius — Overview card and Prior PRs (client)

**Status:** in-progress
**Lesson / ticket:** L04

One spec for the feature:
[../../server/specs/L04-blast-radius.md](../../server/specs/L04-blast-radius.md)
(goal, non-goals, contract, routes, acceptance criteria AC-1..AC-19). This file records only
what is client-specific.

## UI surface
- **Overview** (`pulls/[number]/_components/OverviewTab/`): a two-column grid
  (`minmax(0,1fr) minmax(0,1fr)`, gap 16): `IntentCard` left, `BlastCard` right; Description below on full width. (AC-10)
- **`BlastCard`**: `Card` + `SectionLabel` "Blast radius". Loading → `Skeleton`; `isError && !data` → `ErrorState` with retry.
  - four counters (`count.*`), Tree/Graph switch (`aria-pressed`, default tree);
  - `degraded` → `role="status"` text `degraded.<reason>` and a **Re-index repo** button (not for `flag_off`); a landed resync reloads the blast (AC-13);
  - no downstream and not degraded → `noDownstream`;
  - a divider, then `HistoryAccordion`.
- **`BlastTree`**: one collapsible row per changed symbol (first open), callers indented `depth × 18px` with `via <name>` at depth >= 2, `file:line` links to `githubBlobUrl(repo, indexed_sha ?? head_sha, file, line)`, then endpoint badges (Globe) and cron badges (Clock). (AC-11)
- **`BlastGraph`**: own SVG, one symbol at a time (picker buttons), columns root → callers → indirect callers → endpoints & crons; endpoint/cron edges leave the root dashed; `role="img"`, legend, `graph.empty` when nothing to draw. (AC-12)
- **`HistoryAccordion`**: collapsed by default, count badge, rows `#N` (link), title, author · merged date, overlap count (files in `title`), notes as plain text; empty / degraded / error states. (AC-14)

## Data
`lib/hooks/blast.ts`: `usePrBlast` (query `["pr-blast", prId]`), `usePrHistory` (query `["pr-history", prId]`, `staleTime` 5 min), `useBlastResync(repoId, prId)` (POSTs `/repos/:id/resync` via `useResyncRepoIntel`, polls `useRepoIntelStatus` until `updatedAt` changes, invalidates `["pr-blast", prId]`, gives up after 120 s).

## i18n
All visible strings come from `messages/en/blast.json` (namespace `blast`): `title`, `loadError`, `retry`, `count.*`, `via`, `openLine`, `degraded.*`, `resync*`, `graph.*`, `history.*` plus the pre-existing `stat.*`, `view.*`, `callerCount`, `noDownstream`. (AC-15)

## Tests
`BlastCard`, `BlastGraph/helpers`, `BlastCard/helpers`, `HistoryAccordion`, `OverviewTab`, `hooks/blast`; hooks are mocked with `vi.mock("@/lib/hooks", …)`, interaction via `fireEvent`.
