# Skills — reusable prompt blocks (client)

**Status:** done
**Lesson / ticket:** L02

The feature spans `server/` and `client/`, so it keeps **one** spec:
[../../server/specs/L02-skills.md](../../server/specs/L02-skills.md) — goal,
non-goals, routes, contracts and acceptance criteria all live there.

This file records only what is client-specific.

## UI surface

- **`/skills`** — thin page; logic in `_components/SkillsListView/` +
  `_components/SkillCard/`. Card grid mirroring `AgentsListView` (same
  `CARD_GRID_COLS`), a name search, and a `Dropdown`-wrapped Add button offering
  **Create from scratch** / **Import from file**. A card shows name, type chip,
  description and an enabled `Toggle` (its click `stopPropagation`s so the card
  navigation does not fire).
- **`/skills/[id]`** — left rail + `SkillEditor` with `<Tabs>`; tab state in
  `?tab=`, as the Agent editor does.
  - **Config** — name, description, type, markdown body.
  - **Preview** — read-only `<Markdown>`.
  - **Versions** — cards newest-first with **Diff** (inline panel against the
    previous version) and **Restore** (confirm → delete newer versions).
- **`/agents/[id]?tab=skills`** — attach/detach, enable/disable, reorder.

## Client-specific decisions

- **Type dropdown is creatable.** `SearchableSelect` can only pick from
  `options`. It gains an additive `creatable?: boolean` prop: when the query
  matches nothing exactly, a `Create "<query>"` row calls `onChange(query)`.
  Default `false`, so the agent editor's model picker is unchanged. Anything
  added to `vendor/ui` must also land in `/showcase` (asserted by
  `src/test/smoke.test.tsx`).
- **No new dependencies** (`client/pnpm-lock.yaml` is off-limits), which rules
  out a DnD library, a diff library and a form library:
  - reordering uses native HTML5 drag-and-drop, with `↑`/`↓` buttons as the
    keyboard-accessible path, offered only while the filter box is empty
    (dragging inside a filtered list has no well-defined target index);
  - the Versions diff uses a hand-written LCS helper in
    `src/app/skills/helpers.ts`;
  - forms use plain `useState` per field with a `[id]` reset effect, as
    `ConfigTab` already does. Validation is server-side, surfaced by the global
    `MutationCache.onError` toast.
- **Import is `.md` only** — `<input type="file" accept=".md,.markdown">` +
  `File.text()` + `POST /skills/import/preview` as plain JSON. No multipart
  plugin and no zip reader anywhere.
- **i18n**: `messages/en/skills.json` already exists (orphaned) and
  `agents.json` already carries the `skills.*` keys for the agent tab. Extend
  both with targeted `Edit`s — re-dumping the JSON reformats untouched lines.
- **Counter testability**: never render `<span>{count}</span>{label}`; keep the
  number and its word in one message (`"{count} skills"`), per
  `client/INSIGHTS.md`.

## Test plan

Colocated `*.test.tsx` (vitest + RTL + jsdom, `fetch` mocked):

- `SkillCard` — renders name/type/description, toggle does not navigate.
- `SkillEditor` — tab switching actually branches on `?tab=`.
- `VersionsTab` — newest-first order, diff panel, restore confirmation.
- `SkillsTab` (agent editor) — attach/detach, enable/disable, reorder,
  filter hides reordering.
- Import modal — preview then confirm; cancel persists nothing.
- `src/app/skills/helpers.test.ts` — the LCS diff helper.
