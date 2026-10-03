# specs (cross-package)

Feature specs that span **more than one package** (`server/`, `client/`,
`reviewer-core/`, `e2e/`, `mcp-server/`). Nothing else belongs here.

- A spec that touches a single package lives in that package's `specs/`
  (e.g. [server/specs/](../../server/specs/README.md)), not here.
- One file per feature: `<lesson>-<feature>.md` (e.g. `L04-blast-radius.md`),
  started from [_template.md](_template.md) — the one full template for every
  spec, here and in `<pkg>/specs/`.
- Name every affected package near the top, and keep goal, non-goals, contract
  and acceptance criteria here — once.
- A package may keep a short spec for its own details only (UI surface, internals);
  it links back here instead of repeating the shared parts (the short form is
  `<pkg>/specs/_template.md`).
- Update `Status` as work progresses; mark `done` when merged.

## Who writes them

The [`spec-creator`](../../.claude/agents/spec-creator.md) agent drafts a spec
from the request and any design sources (text, images, Figma or Claude Design
exports, existing code), marks what the sources do not settle as
`[NEEDS CLARIFICATION: …]` (at most 3), and leaves it at `Status: draft`.
`implementation-planner` takes the spec as input and treats an open marker as
blocking. Specs written before this template (L01–L04) keep their older shape.
