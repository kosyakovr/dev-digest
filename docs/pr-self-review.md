# PR Self Review

A pre-PR gate that reviews the committed branch diff against the skills this repo
already ships, and blocks `git push` / `gh pr create` while any CRITICAL finding
stands.

**Read this first: it cannot stop a merge.** The hook fires only on Claude Code's
`Bash` tool. A push from a terminal, the VSCode Git panel, GitHub Desktop, or
"Create pull request" on github.com never reaches it. This is a self-discipline aid
for the agent-driven workflow — real enforcement would be a required GitHub check,
which this deliberately is not.

## Why it exists

Every quality check in this repo is CI-only: five path-filtered workflows running
`typecheck` and `test`. There is no linter, no formatter, and no git hook.

Meanwhile `.claude/skills/` holds thirteen skills, several with explicit checkable
rules — `onion-architecture` §10/§13, `frontend-ui-architecture` §13/§15, the
`security` confidence table, `react-best-practices` thresholds — and until now
**nothing ever applied them to a diff**. They fired only when a model happened to
load one while writing code. This closes that loop.

## Usage

```bash
/pr-self-review                       # full gate: route, review, verify, report
/pr-self-review --fast                # greps + deterministic checks only, ~2s, no LLM
/pr-self-review --dispute <id> "..."  # re-run the verifier on one finding
/pr-self-review --waive   <id> "..."  # record an auditable waiver
```

A `--fast` report is for your own edit loop. The hook rejects it — only a full run
satisfies the gate.

## How it works

1. **Scope** — `git diff --name-status -M $(git merge-base main HEAD) HEAD`.
   Committed branch only. Uncommitted work is reported as a coverage warning and
   never reviewed, because that is not what a PR contains.
2. **Route** — each path goes to one or more reviewer groups by glob
   ([`routing.md`](../.claude/skills/pr-self-review/routing.md)). Backend files get
   the backend architecture skills, UI files get the frontend ones. Nothing is
   silently dropped: every path lands in `changed_files`, `excluded_files` or
   `unrouted_files`.
3. **Deterministic checks** — free, always run: the routing drift guard, the
   vendored-contract twin check, and the greps.
4. **Review** — one sub-agent per active group, ≤3 concurrent, each told to *read*
   its skill files by path and given only its own slice of the diff at `-U10`.
5. **Ground** — findings whose file, line range or `+`-line evidence does not exist
   in the diff are dropped, mirroring `reviewer-core/src/grounding.ts`.
6. **Verify** — only if a CRITICAL survives, one adversarial agent tries to break
   it. Default answer is downgrade.
7. **Report** — written to `.git/devdigest/pr-self-review.{json,md}` and printed in
   the same format the product posts on a real PR.

### Borrowed, not invented

This repo *is* an AI PR-review product, so the gate speaks its vocabulary:

| Concept | Source |
|---|---|
| `CRITICAL` / `WARNING` / `SUGGESTION` | `server/src/vendor/shared/contracts/findings.ts` |
| Blocking rule (fail on ≥1 CRITICAL) | `gateTriggered` in `reviewer-core/src/output/to-review.ts` |
| Score (100 − 35/12/3 per finding) | `scoreFromFindings` in `reviewer-core/src/review/reduce.ts` |
| Output markdown | `composeBody` in `to-review.ts` |
| Severity rubric, verdict, findings discipline | `docs/agent-prompts/README.md` and `general-reviewer.md` |

If you change any of those, change them there — not here.

### The grep baselines compute themselves

The architecture skills ship grep rules, but the repo has 56 pre-existing
deep-relative imports and four grandfathered Drizzle-in-handler modules. So each
pattern runs at **both** `HEAD` and the merge-base and only the difference is
reported. Grandfathered hits cancel mechanically — no baseline table to maintain,
and `git grep` sidesteps the ugrep quirk recorded in the root `INSIGHTS.md`.

## Overrides

Three tiers, all logged to
[`suppressions.md`](../.claude/skills/pr-self-review/suppressions.md): waive one
finding (≥40-character reason, dies on the next commit), dispute it (the verifier
reverses itself on the record), or `PR_SELF_REVIEW_BYPASS=1 git push` (allowed,
loudly announced).

At three suppressions of the same rule the skill proposes a concrete fix instead of
suppressing quietly. A rule suppressed five times should be deleted — the log is
what makes that visible instead of arguable.

## Maintenance

| When | Do |
|---|---|
| Changed the hook | `.claude/hooks/test-gate.sh` — 23 offline cases |
| Changed a routed skill | Re-run the relevant fixture in `.claude/skills/pr-self-review/fixtures/` |
| Added a skill | Add it to `routing.md`, or the drift guard will warn on every run |
| Gate feels wrong | Read `suppressions.md` before changing a rule |

## Known rough edges

- **`gh` is not installed** on the machine this was built on, so `git push` carries
  the whole gate today.
- **Gating `git push` catches WIP pushes too.** Break-glass covers it; expect
  friction at first.
- **Command matching is a regex over a shell string**, so `echo "git push"` is
  denied. Keeping the exemption list short is the deliberate trade.
- **~40 ms Node cold start on every Bash call.** Structural — hook matchers match
  tool names, not arguments. The regex test runs before any subprocess.
- **`skills_digest` invalidation is aggressive.** A typo fix in any `SKILL.md`
  invalidates every outstanding report. Correct, occasionally annoying, always
  explained in the denial message.
- **Renamed-and-modified files** can produce a grep hit with no counterpart at the
  merge-base. `-M` rename detection mitigates it; a leftover shows up as
  non-blocking drift.
- **Models still inflate severity.** Three layers reduce it; nothing eliminates it.
  That is what the waiver path is for.

## Optional local hardening

A `pre-push` git hook would close the terminal-push hole, but git hooks are not
committed (so they need a one-time install) and `--no-verify` defeats them anyway.
Worth it only if you push from a terminal often.
