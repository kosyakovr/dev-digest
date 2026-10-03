# specs

Feature specs written **before** implementation. One file per feature:
`<lesson>-<feature>.md` (e.g. `L01-cost-badge.md`), started from the full
template [docs/specs/_template.md](../../docs/specs/_template.md) (EARS
acceptance criteria, states and edge cases, `[NEEDS CLARIFICATION]` instead of
guesses). Usually written by the [`spec-creator`](../../.claude/agents/spec-creator.md)
agent, then planned by `implementation-planner`.

- Update `Status` as work progresses; mark `done` when merged.
- Only specs that touch this package alone live here. A feature spanning several
  packages keeps ONE spec in [docs/specs/](../../docs/specs/README.md); a file here
  may hold only this package's details and links back to it — the short form in
  [_template.md](_template.md).
