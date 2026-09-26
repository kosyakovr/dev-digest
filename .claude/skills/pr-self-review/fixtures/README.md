# Fixtures — severity calibration

Six small diffs with a committed expected outcome. Run them after editing **any**
skill this gate routes to: if a fixture's severity moves, the edit changed the
reviewer's temperament, and you find out before a teammate does.

Each fixture is a directory with:

- `diff.patch` — a minimal unified diff, applied to nothing; it is fed to a reviewer
  agent exactly as a real slice would be
- `expected.json` — `{ group, expect: "CRITICAL"|"WARNING"|"SUGGESTION"|"none", rule, why }`

## The set

| Fixture | Group | Expected | Why this one |
|---|---|---|---|
| `new-file-cross-module-reach` | A | **CRITICAL** | The clearest onion §4 violation, in an `A`-status file. If this stops being CRITICAL the gate has gone blind. |
| `modified-file-same-pattern` | A | **WARNING** | The *same* pattern in an `M`-status file. Catches a reviewer that ignores the "new files only" scope. |
| `grandfathered-drizzle-in-handler` | A | **none** | `pulls/routes.ts` querying Drizzle — explicitly permitted by §11. Catches a reviewer that reports known exceptions. |
| `refetch-is-not-fetch` | C | **none** | A `refetch()` call in a component. Catches a regression of the §15 grep that used to match `fetch(`. |
| `express-shaped-non-issue` | E | **none** | Code with no Helmet and no Mongoose sanitisation — neither exists in this stack. Catches the security skill's stack mismatch leaking through. |
| `missing-tenancy-scope` | B | **CRITICAL** | A new repository query with no `workspaceId`. A tenancy gap is the one security bug this repo's own docs call out by name. |

## Running them

There is no runner script — deliberately. Each fixture costs a real review call,
and a runner invites running all six on every change. Feed one to a reviewer agent
the way `SKILL.md` §4 describes, and compare the returned severity to
`expected.json`.

## Two honest caveats

1. **It costs a review run per fixture.** Use them after a skill edit, not on every
   gate run.
2. **LLM output is not deterministic.** A single flip is a signal to re-run, not a
   regression. Treat a severity that moves twice in a row as real.
