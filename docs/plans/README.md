# plans

Implementation Plans — one per spec, written by the
[`implementation-planner`](../../.claude/agents/implementation-planner.md) agent and
**saved here by the main session** (the planner is read-only). A plan is the
contract the rest of the run works to: the implementer executes it, test-writer
takes its Test brief, and plan-verifier grades the finished work against it,
item by item. Committed, so a new chat can pick the run up from the file alone.

## Files

- `<lesson>-<feature>.md` — the **same name as its spec** (`docs/specs/L05-x.md`
  or `<pkg>/specs/L05-x.md` → `docs/plans/L05-x.md`), whether the spec is
  cross-package or not. One folder, so every plan is found in one place.
- The planner's output verbatim, with the header below. Saved from the agent's
  `output_file` with a script, never re-typed
  ([`.claude/agents/README.md`](../../.claude/agents/README.md) § Token budget rule 1).
- Nothing else lives here: no reports, no notes. Reports stay out of the repo.

## Header

```markdown
# Implementation Plan: <feature>
**Status:** draft | approved | in-progress | done
**Spec:** docs/specs/<file>.md @ <short sha of the commit holding the spec as planned>
**Approved:** <YYYY-MM-DD> by the user — gates: GT-1 ✓, GT-2 ✗ · execution mode: multi-agent · accepted: REC-1, REC-3
Packages: … · Requirements: … · Lesson/ticket: …
```

The planner emits `**Status:** draft` and `**Spec:**` (path only); the main
session adds `@ <sha>` and the `**Approved:**` line.

## Status — who moves it, and when

| Status | Set by | When |
|---|---|---|
| `draft` | implementation-planner (its output) | the plan is saved, before the user has answered its Summary |
| `approved` | the main session, **only on the user's direct instruction** ("plan approved", "затверджую план") — never inferred from "go", "ok" on something else, or an answered question | after the Gates, the execution mode and the `REC-n` are answered, and the planner's defaults are folded into the spec (§ Order below) |
| `in-progress` | the main session | when the implementer (or the single-agent pass) starts |
| `done` | the main session | when plan-verifier returns PASS on the final tree and the work is committed |

The `**Approved:**` line is the only record of which Gates the user approved.
The implementer and plan-verifier read the Gates from it; a delegation prompt
cannot approve a Gate this line does not list. Changing the line is a new
approval — only on the user's direct instruction again.

## Order around the spec

```
spec (Status: approved) ─► implementation-planner ─► plan, Status: draft
  ─► user answers: Gates · execution mode · REC-n · the defaults in Requirements review
  ─► accepted REC-n ─► the SAME planner revises (SendMessage)
  ─► spec-creator folds the planner's defaults into the spec as A-n (spec-creator.md § Plan-defaults round)
  ─► commit the spec ─► plan header: Spec @ <that sha>
  ─► user: "plan approved" ─► Status: approved + Approved line ─► commit the plan
```

## Changing an approved plan

Never rewrite it in place. Add these two sections just **above** the
`<!-- test-brief -->` marker — the part above it is what the implementer and
the reviewers get, so an amendment below it would never reach them:

```markdown
## Amendments
- **AM-1** <YYYY-MM-DD> — <what changes, which WP / AC> — why: <implementer deviation, gate refused, …> — approved by the user <date>

## Run log
- <YYYY-MM-DD> test-writer T1 — 6 tests in 3 files, all red:assertion
- <YYYY-MM-DD> implementer — Status done · snapshot <sha> · T1 6/6 green
- <YYYY-MM-DD> test-writer T2 — 9 tests, T1 mutation-proved 6/6
- <YYYY-MM-DD> fix round 1 — findings AR-2, SR-1, PV WP3.done
- <YYYY-MM-DD> plan-verifier — PASS
```

The **Run log** is how the fix-round limit (at most **two** fix rounds, then the
user decides — `.claude/agents/README.md` § The flow) survives a new chat.
Only the main session writes this folder; the guards deny it to every subagent.
