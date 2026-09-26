# Conventions — repo house-rules → candidates → skill (client)

**Status:** done
**Lesson / ticket:** L02

The feature spans `server/` and `client/`, so it keeps **one** spec:
[../../server/specs/L02-conventions.md](../../server/specs/L02-conventions.md) —
goal, non-goals, decisions, routes, contracts and acceptance criteria all live
there.

This file records only what is client-specific.

## UI surface

- **Sidebar** — `src/vendor/ui/nav.ts` grows a second group **SKILLS LAB**
  holding `Agents`, `Skills` and the new `Conventions`
  (`/repos/:repoId/conventions`, icon `ListChecks`, `g c`); WORKSPACE keeps
  `Pull Requests`. `SHORTCUTS` is a separate hand-maintained list and gets the
  `g c` row too. `activeKeyFor()` already maps `/conventions`.
- **`/repos/[repoId]/conventions`** — thin route page holding the triage state:
  - a **Run extraction / Re-scan** button (pending label `Scanning…`);
  - a **scan summary** after a scan: proposed, dropped by the gate, duplicates,
    model and cost — so "3 candidates" reads as the gate working;
  - **filter chips** with counts (All / Pending / Accepted / Rejected);
  - a **selection checkbox** per candidate and a **Create skill** action that is
    disabled until at least one is selected, so one board can yield several
    skills;
  - `EmptyState` before the first scan, from the existing `page.empty.*` keys.
- **`_components/ConventionCard`** — rule, category chip, evidence
  `path:line` linking to that exact line on GitHub, the verified snippet,
  a confidence bar graded on four steps (`CONFIDENCE_BANDS`: green from 85,
  yellow from 70, orange from 60, red below — the two missing hues were added to
  the design system's tokens), and accept / reject / edit / delete. Edit is inline
  (rule + rationale) and saves through `useUpdateConvention`.
- **`_components/CreateSkillModal`** — seeds its form once from the server draft
  (a `seeded` ref, as the draft arrives async), lets the user edit name,
  description, type and body, then saves through the existing `useCreateSkill`
  and routes to `/skills/:id?tab=config`. It pads its own body: `kit/Modal`
  renders children edge-to-edge.

## Data layer

`src/lib/hooks/conventions.ts`, re-exported from `src/lib/hooks/index.ts`:
`useConventions(repoId)` (key `["conventions", repoId]`), `useExtractConventions`
— a **mutation**, not a query, because a scan costs a model call; it seeds the
list cache from its own response — `useUpdateConvention`, `useDeleteConvention`,
`useConventionSkillDraft`. The repo comes from `useActiveRepo()`.

## i18n

Extends the existing `messages/en/conventions.json` namespace with the triage
filters, the scan summary, the card actions and the create-skill modal. Edits
are targeted — re-dumping the file reformats untouched lines.

## Test plan

Colocated Vitest + RTL, mocking the hook module (not `fetch`):

| File | Covers |
|------|--------|
| `helpers.test.ts` | filtering by status, counts, selection helpers |
| `_components/ConventionCard/ConventionCard.test.tsx` | accept / reject / edit / delete callbacks, evidence link, snippet rendering |
| `page.test.tsx` | empty state, scan summary, filter chips, Create-skill gating on selection |
