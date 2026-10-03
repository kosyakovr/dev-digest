# specs (cross-package)

Feature specs that span **more than one package** (`server/`, `client/`,
`reviewer-core/`, `e2e/`, `mcp-server/`). Nothing else belongs here.

- A spec that touches a single package lives in that package's `specs/`
  (e.g. [server/specs/](../../server/specs/README.md)), not here.
- One file per feature: `<lesson>-<feature>.md` (e.g. `L04-blast-radius.md`),
  started from a package `_template.md` (e.g. [server/specs/_template.md](../../server/specs/_template.md)).
- Name every affected package near the top, and keep goal, non-goals, contract
  and acceptance criteria here — once.
- A package may keep a short spec for its own details only (UI surface, internals);
  it links back here instead of repeating the shared parts.
- Update `Status` as work progresses; mark `done` when merged.
