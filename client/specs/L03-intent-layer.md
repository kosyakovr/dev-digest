# Intent Layer — Intent card (client)

**Status:** in-progress
**Lesson / ticket:** L03

One spec for the feature:
[../../server/specs/L03-intent-layer.md](../../server/specs/L03-intent-layer.md)
(goal, non-goals, contract, routes, acceptance criteria). This file records only
what is client-specific.

## UI surface
- **`IntentCard`** (`pulls/[number]/_components/OverviewTab/_components/IntentCard/`),
  rendered above Description on the Overview tab. States:
  - loading → `Skeleton`; GET error → `ErrorState` with retry;
  - `intent === null` → `EmptyState` "No intent derived yet." and a **Derive intent** button;
  - data → statement (italic), a confidence `Badge`, an "Outdated…" badge when `stale`,
    an icon-only **Re-derive intent** button (`aria-label`), IN SCOPE / OUT OF SCOPE
    lists ("None stated" when empty), a low-confidence hint, one "Sources: …" line
    (or "Sources: diff only"; branch and files fold into "diff"), a "Not used: …"
    line for unresolved sources, and a `model · cost` footer (cost omitted when null);
  - derive failure → inline error under the card, previous data kept.
- **Run trace drawer**: a "Stated intent — derived, untrusted (dynamic)" prompt block
  when `prompt_assembly.intent` is non-null.

## Data
`lib/hooks/intent.ts`: `usePrIntent` (query `["pr-intent", prId]`) and
`useDeriveIntent` (mutation, never on mount; seeds the cache). The PR page also
invalidates `["pr-intent", prId]` when a run settles.

## i18n
`messages/en/intent.json` (namespace `intent`); `runs.json` gains `trace.prompt.intent`.

## Test plan
Deferred in this iteration. See the server spec.
