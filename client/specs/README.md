# specs

Feature specs written **before** implementation. One file per feature:
`<lesson>-<feature>.md` (e.g. `L01-cost-badge.md`), started from the full
template [docs/specs/_template.md](../../docs/specs/_template.md) (EARS
acceptance criteria, states and edge cases, `[NEEDS CLARIFICATION]` instead of
guesses). Usually written by the [`spec-creator`](../../.claude/agents/spec-creator.md)
agent, then planned by `implementation-planner`.

- `Status` moves `draft → approved → in-progress → done`; who moves it and
  when: [docs/specs/README.md § Status](../../docs/specs/README.md#status).
- Only specs that touch this package alone live here. A feature spanning several
  packages keeps ONE spec in [docs/specs/](../../docs/specs/README.md); a file here
  may hold only this package's details and links back to it — the short form in
  [_template.md](_template.md).
