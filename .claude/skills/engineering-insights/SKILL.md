---
name: engineering-insights
description: >-
  Reads and maintains the per-package INSIGHTS.md files that carry non-obvious
  engineering knowledge between sessions. Use at the start of any task that
  touches server/, client/, reviewer-core/ or e2e/, to load that package's
  insights before the first edit. Use again the moment a session hits a
  surprise, a wrong assumption corrected by evidence, a workaround, a decision
  with a non-obvious reason, or a tool or environment quirk, and at the end of
  any task that involved debugging, a failing test, or a user correction. Also
  use when the user says "/engineering-insights", "wrap up", "capture
  learnings", "what did we learn", "запиши інсайти" or "що ми вивчили".
---

# Engineering Insights

Each package keeps an `INSIGHTS.md` of things a future session cannot guess from
the code. This skill has two jobs — **read it before work, write to it after** —
and a third that matters just as much: **write nothing when there is nothing
worth writing.**

## 1. Read first — before the first edit

Identify the package from the files the task will touch, then read its file
before editing anything:

| Files touched | File |
|---|---|
| `server/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| two or more packages · `*/src/vendor/shared/**` · CI, Docker, root scripts | `INSIGHTS.md` (repo root) |

Two packages in scope means reading both files. Treat what you read as
high-confidence guidance unless the user says otherwise. An entry that
contradicts what you observe is a finding — say so rather than silently
picking a side.

## 2. Capture as you go

Do not wait for the end of the task. The moment something clears the gate
below, write it — by the end of a long session the detail is gone.

## 3. The gate — five questions, all must pass

1. **Would a future session behave differently knowing this?** No → don't write.
2. **Could anyone reading the code have worked it out?** Yes → don't write.
3. **Is it already in CLAUDE.md, a README, `docs/` or `specs/`?** Yes → don't write.
4. **Is it already in this INSIGHTS.md?** Yes, and it is still accurate → write
   nothing. Yes, but you learned more → add a new dated line directly beneath it,
   leaving the original line byte-for-byte untouched. Never merge your finding
   into the wording of an existing entry. This is why step 1 is not optional.
5. **Can you name the concrete thing — file, flag, table, command, version?**
   No → don't write it yet. Vagueness is worse than silence.

A session where nothing passes the gate is a normal session. Say "nothing worth
capturing" and stop. Volume is not the goal; signal is.

### Specific enough to act on cold

| ❌ Noise | ✅ Insight |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items → use `Promise.allSettled()` in batches of 10." |
| "be careful with async" | "Checkout state always goes through Zustand (`cartStore.ts`) — three components share the cart, local state silently desyncs." |
| "tests are flaky" | "Vitest picks up `*.it.test.ts` without Docker → run unit tests with `--exclude '**/*.it.test.ts'`." |

The test from the lab: **if it would be obvious to anyone reading the code,
don't write it.**

## 4. Where the entry goes

Four rubrics, routed into the file's seven sections:

| Rubric | Section | What it is |
|---|---|---|
| **Pattern** | `## What Works` | An approach that proved out here |
| **Mistake** | `## What Doesn't Work` | A dead end or antipattern — *the highest-value section; do not skip it* |
| **Mistake**, seen twice | `## Recurring Errors & Fixes` | Same error hit more than once, plus the fix |
| **Decision** | `## Codebase Patterns` | A convention or design choice **whose reason is not obvious**. If the reason is obvious, or the decision needs a paragraph, it belongs in `<pkg>/docs/` instead |
| **Context** | `## Tool & Library Notes` | A quirk of a dependency, tool or environment |
| — | `## Open Questions` | Something left unresolved, phrased as a question |
| — | `## Session Notes` | See the hard cap below |

**Entry format**, newest first inside its section:

```
- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)
```

One insight per bullet. Atomic beats thorough — long paragraphs get skimmed and
then ignored.

**`## Session Notes` takes one line per session, and only for a session that
produced at least one entry above it.** It is the section that bloats the file
first, and the file is `@import`ed into every session for that package — so once
it passes 5 lines, do not delete anything: append as usual and tell the user the
section is due for consolidation (§6).

## 5. Write rules — an INSIGHTS.md is append-only

An entry is somebody's hard-won finding, often from another session or another
person. Losing one is worse than never writing yours. These rules are not
stylistic:

- **MUST use `Edit` to insert. MUST NOT use `Write` on an INSIGHTS.md that
  already exists** — regenerating the file from memory silently drops every
  entry you did not happen to reproduce. `Write` is allowed only to create the
  file from the scaffold when it genuinely does not exist.
- **MUST re-read the file immediately before every insertion**, even if you read
  it earlier in the same session. Another session may have appended since.
- **MUST NOT modify, reword, reorder, reflow or delete any existing line** —
  including your own from earlier in the session, and including the header block
  and the seven `##` headings. Corrections go in as a new dated line beneath the
  entry they correct.
- One `Edit` per entry, inserting at the top of its section. Never rebuild a
  section to "tidy" it.
- **One insight, one file.** Never copy the same entry into two packages — if it
  is genuinely shared, it belongs in the root `INSIGHTS.md`.
- Never write insights into this skill's own files.

### Verify the write was purely additive

After writing, run `git diff -- <file>` and read it. **Every changed line MUST
be a `+` line.** A single `-` line means something was clobbered — the diff shows
its exact text, so put it back with a targeted `Edit` and redo your insertion
more narrowly. Do not `git checkout` the file: that would also discard
uncommitted work that was never yours.

If the file has uncommitted changes from someone else's work, say so and let the
user decide rather than writing over an unclear state.

Then state in one line what was added and where, so the user can spot-check it.
These files are a draft under review, not truth.

## 6. When a file passes 100 lines — propose, do not act

Consolidation is the only operation that removes text, so the skill never
performs it on its own initiative. Keep appending, and hand the user a proposal:

1. Duplicate and near-duplicate entries that could merge.
2. Settled knowledge that could move to `<pkg>/docs/`.
3. Entries that look stale or contradict another entry.

Present it as a list the user can read without opening the file, quoting each
entry you would touch and saying what would happen to it. **Rewrite the file only
after the user approves in that same turn, and only the entries they approved.**
Approval to consolidate one file is not approval for the others.

Marking an entry in place with `[REVIEW NEEDED]` is an edit to an existing line,
so it needs the same approval.

## Scope

This skill captures engineering knowledge. It does not review code, write
documentation or specs, run tests, or edit CLAUDE.md. Migrations and lock files
are off-limits — see the root [CLAUDE.md](../../../CLAUDE.md).

## Known limitation (L01)

Triggering is probabilistic: this skill fires on its description, so it will
sometimes not fire at all. Until a `Stop` hook makes capture deterministic,
invoke it by hand at the end of a session — `/engineering-insights`.
