# specs (cross-package)

Feature specs that span **more than one package** (`server/`, `client/`,
`reviewer-core/`, `e2e/`, `mcp-server/`). Nothing else belongs here.

- A spec that touches a single package lives in that package's `specs/`
  (e.g. [server/specs/](../server/specs/README.md)), not here.
- One file per feature: `<lesson>-<feature>.md` (e.g. `L04-blast-radius.md`),
  started from [_template.md](_template.md) — the one full template for every
  spec, here and in `<pkg>/specs/`.
- Name every affected package near the top, and keep goal, non-goals, contract
  and acceptance criteria here — once.
- A package may keep a short spec for its own details only (UI surface, internals);
  it links back here instead of repeating the shared parts (the short form is
  `<pkg>/specs/_template.md`).
- `Status` moves through `draft → approved → in-progress → done` — who moves it
  and when: § Status below.

## Who writes them

The [`spec-creator`](../.claude/agents/spec-creator.md) agent drafts a spec
from the request and any design sources (text, images, Figma or Claude Design
exports, existing code), marks what the sources do not settle as
`[NEEDS CLARIFICATION: …]` (at most 3), and leaves it at `Status: draft`.
`implementation-planner` takes the spec as input and treats an open marker as
blocking. Specs written before this template (L01–L04) keep their older shape.
Cross-package specs lived in `server/specs/` until 2026-10-03; an older
reference `server/specs/L0x-….md` means `specs/<same name>`.
A spec's Implementation Plan lives in [`docs/plans/`](../docs/plans/README.md) under the same file name.

## Status

| Status | Set by | When |
|---|---|---|
| `draft` | spec-creator (it writes nothing else) | while the spec is written and its markers are answered |
| `approved` | the main session, **only on the user's direct instruction** ("spec approved", "затверджую специфікацію") — never inferred | after the user has reviewed the spec and no `[NEEDS CLARIFICATION` marker is left |
| `in-progress` | the main session | when the plan built from it is approved and implementation starts |
| `done` | the main session | when the work is merged |

`implementation-planner` plans only from an `approved` spec (a `draft` is
blocking). Past `draft`, spec-creator's guard asks before every edit — the one
planned edit of an approved spec is the plan-defaults round
([spec-creator](../.claude/agents/spec-creator.md) Step 0), and the spec
stays `approved` through it. A change to an `in-progress` or `done` spec is a
new draft that links the old one.
