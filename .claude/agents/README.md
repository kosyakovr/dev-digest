# Subagents

Project subagents for DevDigest. This file is the map of the set: who does what,
with which rights, what goes in and what comes out, and where the rules come
from. The agent files themselves hold the procedures and report templates; read
those for detail, and do not copy them here.

Each file's frontmatter is its whole permission model; the body is its system
prompt. A session that started before this folder existed does not see it at all
(`Agent type '…' not found`) — restart, or check from a fresh `claude -p` session.

## At a glance

| Agent | Responsibility | Not its job | Model |
|---|---|---|---|
| [`researcher`](researcher.md) | Answers **one concrete question** with evidence — from the repo (code, config, docs, git history), external sources, or both | Changing anything; many-source narrative reports (`/deep-research`) | `sonnet` |
| [`brainstormer`](brainstormer.md) | Compares **2–4 genuinely different options** for one design decision (+ the status quo) against drivers fixed first from the repo, recommends one, leaves the pick to the user; hands the pick to implementation-planner | Planning work packages, code, web research (→ researcher), deciding for the user | `opus`, `effort: high` |
| [`spec-creator`](spec-creator.md) | Writes the **feature spec** before any plan, from the request and the design sources the main session saved (text, images, Figma / Claude Design exports, code, a local checkout): analyses the design for missing states, edge cases, cross-package hops and UX gaps, then fills `docs/specs/_template.md` — EARS acceptance criteria, a source on every requirement, assumptions, proposals, ≤3 `[NEEDS CLARIFICATION]` markers; one package → `<pkg>/specs/`, several → `docs/specs/` | Plans, code, docs, fetching links (the main session saves them), deciding open questions or accepting its own proposals, moving a spec past `draft` | `opus`, `effort: high` |
| [`implementation-planner`](implementation-planner.md) | Reviews the **requirements we already have** (spec, request, brainstormer pick) for gaps, conflicts and untestable items, then turns them into an **Implementation Plan**: what already exists, work packages per file, the skills that bind each one, gates, acceptance criteria, test plan, recommendations, and the **multi-agent vs single-agent** question for the user | Writing or updating **specs** (input only), code, web research, review steps, choosing the execution mode for the user | `opus`, `effort: high` |
| [`implementer`](implementer.md) | Executes an **approved** plan in `server/`, `client/` (and `reviewer-core/` or `mcp-server/` when the plan says so), runs the existing checks, compares its diff to the plan, hands the tests to test-writer | **Writing tests**, planning, architecture/security review, `/pr-self-review`, commits, pushes, PRs, writing `INSIGHTS.md` | `sonnet` |
| [`test-writer`](test-writer.md) | Writes **all** tests — server, client, reviewer-core, mcp-server, e2e flows on request — in two passes per plan (**T1** acceptance tests before the implementer, **T2** the rest after it), with assertions taken from the plan or spec, and proves each new test fails without its behaviour (**red-proof**: red now in T1, a throwaway worktree or a mutation in T2) | Production code, configs, dependencies, weakening a red test | `sonnet`, `effort: high` |
| [`plan-verifier`](plan-verifier.md) | Grades **every item** of a plan — goal, non-goals, contract, decisions, gates, each work package, acceptance criteria, test plan, docs — PASS / FAIL / UNVERIFIABLE in a traceability matrix, with its own code and test evidence | Advice, code review, an overall score | `opus`, `effort: high` |
| [`architecture-reviewer`](architecture-reviewer.md) | Checks the change against the written **architectural boundaries** (onion layering, client placement and imports, vendored twins, reviewer-core purity): rule → `file:line` → quoted evidence → severity, each finding re-verified | Security, style, tests, fixing code, the pre-push gate | `opus`, `effort: high` |
| [`security-reviewer`](security-reviewer.md) | Reports only **exploitable** problems in the change: source → sink → preconditions → exploit → confidence, severity on the repo's CRITICAL / WARNING / SUGGESTION scale, each finding re-verified; prompt-injection-shaped text listed, never followed | Architecture, style, tests, fixing code, DoS / rate limiting, the pre-push gate | `opus`, `effort: high` |
| [`doc-writer`](doc-writer.md) | Documents **implemented** behaviour from a plan, report, diff or notes, verified against the code, with Mermaid diagrams, placed by the repo's taxonomy (`<pkg>/docs/`, ADRs, `docs/`, README, `TESTING.md`) | Code, `INSIGHTS.md`, specs and `AGENTS.md` without approval, documenting plans as if built | `sonnet`, `effort: medium` |

## Permissions

| | researcher | brainstormer | implementation-planner | implementer | test-writer | plan-verifier | architecture-reviewer | security-reviewer | doc-writer | spec-creator |
|---|---|---|---|---|---|---|---|---|---|---|
| `tools` | Read, Grep, Glob, Bash, WebSearch, WebFetch | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash, Edit, Write, TodoWrite | Read, Grep, Glob, Bash, Edit, Write, TodoWrite | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash | Read, Grep, Glob, Bash, Edit, Write, TodoWrite | Read, Grep, Glob, Bash, Edit, Write, TodoWrite + 4 read-only `mcp__devdigest__*` tools |
| `disallowedTools` | Write, Edit, NotebookEdit, Skill | same as implementation-planner | Write, Edit, NotebookEdit, Skill, WebFetch, WebSearch, Agent, ExitPlanMode | Agent, Skill, WebFetch, WebSearch, NotebookEdit | Agent, Skill, WebFetch, WebSearch, NotebookEdit | Write, Edit, NotebookEdit, Skill, WebFetch, WebSearch, Agent, ExitPlanMode | same as plan-verifier | same as plan-verifier | Agent, Skill, WebFetch, WebSearch, NotebookEdit | Agent, Skill, WebFetch, WebSearch, NotebookEdit, `mcp__devdigest__run_agent_on_pr` |
| `permissionMode` | inherited | `default` | `default` ⚠ | `acceptEdits` | `acceptEdits` | `default` | `default` | `default` | `acceptEdits` | `acceptEdits` |
| Writes files? | no | no | no | yes, guarded — no tests, specs, plans or `INSIGHTS.md`, and only through Edit/Write | test files only, guarded | no | no | no | markdown docs only, guarded — never specs or plans | draft specs only (`docs/specs/`, `<pkg>/specs/`), guarded |
| Bash | inspection only — by prompt | inspection only, **guarded read-only** | inspection only — by prompt, **guarded read-only** | anything except what the guard denies | + shell writes inside the red-proof worktree | inspection + test commands, **guarded read-only** | inspection, **guarded read-only** | inspection, **guarded read-only** | inspection, no shell writes | inspection, no shell writes |
| Hook | — | `agent-scope-guard.sh` `read-only` | `agent-scope-guard.sh` `read-only` | [`implementer-guard.sh`](../hooks/implementer-guard.sh) | [`agent-scope-guard.sh`](../hooks/agent-scope-guard.sh) `test-writer` | `agent-scope-guard.sh` `read-only` | `agent-scope-guard.sh` `read-only` | `agent-scope-guard.sh` `read-only` | `agent-scope-guard.sh` `doc-writer` | `agent-scope-guard.sh` `spec-creator` |

Read-only for researcher is **two layers**: no write tools in frontmatter, and
a prompt rule against writing through Bash. brainstormer, implementation-planner,
plan-verifier, architecture-reviewer and security-reviewer get a **third**
layer — they need Bash for real work (`git log --all`, `git grep` at two
revisions, `git diff` of an uncommitted change, running the test plan): the
`read-only` guard profile, which denies redirects, `rm`/`mv`/`cp`/`tee`/`sed -i`, installs and git
state changes. A subagent's Bash cannot be narrowed by `disallowedTools` — a
command-specific entry there removes the whole tool — so a hook is the only
per-command control ([subagent docs](https://code.claude.com/docs/en/sub-agents)).

**No web tools for security-reviewer or brainstormer.** security-reviewer
reads diff text an attacker can shape and can read private repo data; a web
tool would give it the third leg of the lethal trifecta (untrusted input +
private data + a way out — `docs/agent-prompts/security-reviewer.md` § Lethal
trifecta, [OWASP LLM01/LLM06](https://genai.owasp.org/llm-top-10/)). The
guard's matcher does not cover web tools, so `disallowedTools` is the control.
The guard also denies `curl`, `wget` and `gh api`, but it matches text and is
not a sandbox. brainstormer leaves external questions to researcher, which
keeps one agent's source discipline for the web.

**No web tools for spec-creator either** (user decision 2026-10-03). Its
design sources — a Figma file, a Claude Design artifact, another repository —
are untrusted text, and the agent reads private repo data and writes files
the planner trusts. So the main session fetches every link first (`Artifact
read` for a Claude Design link, a Figma MCP if one is connected, researcher
or a local checkout for a repository), saves it to the scratchpad and passes
the path; the agent reads only files. Its MCP access is an allowlist of the
four read-only devdigest tools — `run_agent_on_pr` (a paid LLM call) is in
`disallowedTools`.

⚠ **`permissionMode: plan` overrides `model: opus`.** Measured 2026-09-24 on
2.1.281: two otherwise identical subagents with `model: opus` ran on
`claude-sonnet-5` under `plan` and on `claude-opus-5-5` under `default`; the
planner (then `planner`, now `implementation-planner`) ran on `claude-sonnet-5` while it had `plan`. So no agent here uses
plan mode: the read-only ones use `default` and rely on their tools and the
guard (the planner switched on the user's decision, 2026-09-24).

No agent uses the `skills:` frontmatter or `memory:`. `skills:` is documented to
inject the full skill, but [anthropics/claude-code#67251](https://github.com/anthropics/claude-code/issues/67251)
reports only the name arrives; every agent instead **Read**s the
`SKILL.md` sections it needs by path, as `pr-self-review` does — the
implementer the §§ its plan cites per work package (since 2026-10-05; before,
it loaded whole skills through the Skill tool) — and all have `Skill`
disallowed so they cannot start a process skill with side effects
(`pr-self-review` writes `.git/devdigest/`, `engineering-insights` writes
`INSIGHTS.md`). `memory:` would silently re-enable Read/Write/Edit.

## Inputs and outputs

| Agent | Input (the delegation prompt) | Output (its final message) | Stops early with |
|---|---|---|---|
| researcher | A question with scope and an expected answer shape (yes/no, location, list, comparison) | **Repo research** or **External research** report: answer + confidence, findings with `path:line` / URL evidence, inferences, a **Not found** table, open questions | `NEEDS CLARIFICATION` — up to 5 questions and a default assumption |
| brainstormer | One design decision with its scope and the outcome wanted; optionally a researcher report | **Options** report: a ≤8-line **Summary**, context, **decision drivers** (each with its source), considered options (O0 = status quo), each option in detail, a comparison relative to O0 (`++ … −−`, `✗`), eliminated options, a Y-statement **recommendation** ending "Decision: awaiting the user's choice", "Needs research", **Handoff to implementation-planner** | `NEEDS CLARIFICATION` (no decision, scope or outcome); a two-line "only one reasonable design" note |
| spec-creator | A feature request with its outcome; the design sources as **file paths** (images, saved exports, a local checkout) or text; the lesson id and, for MCP reads, the repo / PR; in a **resolution round**, the same agent continued with the user's answers; in a **plan-defaults round**, the planner's Requirements-review rows that are not `ok` with the user's answers | **Spec Report**: status, spec path and counts (ACs, markers n/3, proposals), a ≤8-line Summary, **Questions for the user** (AskUserQuestion-ready, recommended option first), design gaps and how each was resolved, assumptions, proposals, module interaction, sources read / not read, injection-shaped text seen, **Handoff to implementation-planner** (ready to plan?, gates, existing code). The spec file left **uncommitted**, `Status: draft` | `NEEDS CLARIFICATION` — no outcome, or the main design source is an unsaved link |
| implementation-planner | The requirements: a feature request with an outcome and a scope, and/or the path of its spec (`docs/specs/` or `<pkg>/specs/` — it finds one by the feature's nouns if none is given); optionally a researcher report, or a brainstormer report plus the user's pick | **Implementation Plan**: a ≤12-line **Summary** for the user ending with the **execution-mode question** (multi-agent or single-agent, with its recommendation), a **Requirements review** (`R-n` · source · verdict · default taken), goal, non-goals, what already exists, contract, decisions, **Gates**, work packages (files · skills by § · constraints · steps · done when), order, acceptance criteria, test plan, docs to update, **Recommendations** (`REC-n`, not in the plan until accepted), **Execution mode** (recommendation + agent split), risks — then, after a `<!-- test-brief -->` marker, the **Test brief** (`WPn.tests` as Given/When/Then for test-writer). Never plans spec work | `NEEDS CLARIFICATION` — a blocking requirement gap or conflict |
| implementer | The plan **above the marker** — cut from `docs/plans/<file>`, header included: `**Status:** approved` and the `**Approved:**` line are its only proof of the user's approval and of which Gates were approved; or, in a **fix round**, a self-contained list of verified findings | **Implementation Report**: status, changes per work package with changed line ranges (`scripts/change-set.sh`), deviations, the `scripts/checks.sh --force` summary table, unmet acceptance criteria (met ones by ID), **Handoff to test-writer** (Test brief IDs, seams, intended breaks), out-of-scope observations, **Insight candidates**. Code change left **uncommitted** | `BLOCKED` report — no plan, a plan not `approved`, a Gate not ✓ on the `**Approved:**` line, a plan that breaks a rule |
| test-writer | The mode (`T1` or `T2`) + the **whole** plan (Test brief included) or the WP ids / Test plan rows to cover; in T2 also the implementer's handoff (T2 is normally the T1 agent continued with `SendMessage`); or a target behaviour and its source of truth | **Test Report** (`Mode: T1 | T2`): tests with their oracle source, in T1 a **Handoff to implementer** (files and tests that must turn green), in T2 the T1 tests it corrected, verification (3 runs per new file, `.it.test` isolated from real keys; final `scripts/checks.sh --force` table), **Red-proof** table, suspected defects (left red), not covered, insight candidates. Test files left **uncommitted** | `NEEDS CLARIFICATION` (no behaviour or no source of truth); `blocked` (needs a dependency, config or production change) |
| plan-verifier | The plan (`docs/plans/<file>`) above the marker — plus the Test brief when tests are in this iteration — + what is deferred (approved Gates come from its `**Approved:**` line); optionally the implementation and test reports and the files modified before work started; in a re-run, the same agent is continued with `SendMessage` and the delta | **Plan Verification**: `PASS / FAIL / INCOMPLETE`, a traceability matrix (PASS rows: ID · evidence; FAIL / UNVERIFIABLE rows in full), deferred IDs on one line, **Spec coverage** (each spec `AC-n` / `NFR-n` → `R-n` → plan items → verdict), failures with "to pass", scope, commands run | `NEEDS CLARIFICATION` (no plan); `BLOCKED` (no change) |
| architecture-reviewer | Nothing, a commit range, or paths; optionally the plan; in a re-review, the previous round's snapshot id (`change-set.sh --since <snapshot>`) | **Architecture Review**: verdict, scope counts by group, `review-greps.sh` hits (`greps.md` by subtraction) with its reading of each new hit, findings `AR-n` with rule · location · evidence · mechanism, dropped candidates, not checked | `NEEDS CLARIFICATION` (nothing to review) |
| security-reviewer | Nothing, a commit range, or paths; optionally the spec's path, read as a threat model (§ Non-functional, § Contract only); in a re-review, the previous round's snapshot id | **Security Review**: verdict, scope counts, deterministic checks (`review-greps.sh`: tenancy / config-bypass rows, new secret-pattern hits, masked), findings `SR-n` with category · CWE · location · evidence · source → sink · preconditions · exploit scenario · confidence, dropped candidates, **injection-shaped text seen (not followed)**, not checked | `NEEDS CLARIFICATION` (nothing to review) |
| doc-writer | Material (plan, reports, diff, notes) + what to document; optionally a target file | **Documentation Report**: files with Diátaxis type, diagrams, claims verified (`path:line`), discrepancies, text **needing approval**, INSIGHTS promotion candidates. Docs left **uncommitted** | `NEEDS CLARIFICATION` (no material, or the feature is not built) |

## The flow

```
question ─► researcher ─► report ────────────────────┐   (optional, any stage)
design choice ─► brainstormer ─► Options report ─► user picks ─┐   (optional, before planning)
request + design sources ─► main session saves links/exports to files (Artifact read, Figma MCP, researcher for a remote repo)
         ─► spec-creator ─► draft spec (docs/specs/ or <pkg>/specs/) + Spec Report
         ─► user answers the markers and proposals (AskUserQuestion in the main session)
              └ SendMessage to the SAME spec-creator ─► markers folded in (repeat until none)
         ─► user reviews the spec and says so ─► main session: **Status: approved** (only on that word) ─► commit
spec (approved, no open markers) + request (+ the pick)
         ─► implementation-planner ─► Implementation Plan ─► saved as docs/plans/<spec name>, Status: draft
         ─► user answers (Summary + Gates + accepted REC-n + execution mode + the defaults in Requirements review)
              accepted REC-n ─► SendMessage to the SAME implementation-planner ─► revised plan
              defaults (R-n not ok) ─► spec-creator, plan-defaults round ─► spec updated (stays approved) ─► commit
         ─► user approves the plan ─► header: Spec @ <sha>, **Status: approved**, **Approved:** gates · mode · REC ─► commit
              single-agent  ─► main session: [T1] tests (seen red) ─► code until they pass ─► [T2] tests ─► scripts/checks.sh ─► commit ─► …
              multi-agent   ─► "go" for the implementer, continue below (a new chat can start here from the plan file)
         ─► plan + spec Status: in-progress
         ─► test-writer T1 (whole plan) ─► [T1] acceptance tests, red now on an assertion + Handoff to implementer
         ─► implementer (plan above the marker + the T1 files) ─► T1 green ─► Implementation Report + uncommitted code
                         └ scripts/checks.sh --force (CI commands + isolated .it.test; ledger keyed by tree)
                         └ scripts/change-set.sh (line ranges)
         ─► test-writer T2 (SendMessage to the T1 agent + the implementer's handoff) ─► [T2] tests, T1 mutation-proved
                         └ scripts/checks.sh --force at the end
         ─► plan-verifier ∥ architecture-reviewer ∥ security-reviewer (+ the spec as threat model) — all read-only, on the uncommitted change
              └ scripts/checks.sh (cited by package key)   └ scripts/change-set.sh + scripts/review-greps.sh (both reviewers)
         ─► main session: save each report from its output_file with a script, relay verdict + counts + non-PASS rows
              FAIL / findings ─► implementer (fix round: findings only) or test-writer — AT MOST 2 fix rounds (Run log)
                              ─► re-review: SendMessage to the SAME reviewer, delta from `change-set.sh --since <snapshot>`
              still failing after round 2 ─► stop: the user decides (another round, an amendment, a waiver)
         ─► each reviewer's final round without request_changes ─► scripts/review-record.sh add <reviewer> <verdict>
         ─► plan-verifier's final run on the final tree (SendMessage, the delta) ─► PASS
         ─► doc-writer (plan + Implementation Report + Plan Verification) ─► docs — only now: the code is frozen
         ─► main session: INSIGHTS.md from every report's "Insight candidates"; plan Status: done
         ─► commit ─► /pr-self-review (skips groups A/C/E the records cover) ─► push ─► spec Status: done when merged
```

Subagents cannot ask the user anything (`AskUserQuestion` is never given to a
subagent), so each one returns a `NEEDS CLARIFICATION` or `BLOCKED` block
instead, and the main session relays it. The same holds for the
implementation-planner's **execution-mode question**: the main session puts it
to the user (with `AskUserQuestion`) before anything runs, and never answers
it for them. Subagents do not see the conversation
either: the plan reaches each agent only through the delegation prompt, so pass
it **verbatim** or as the path of the file it was saved to, together with which
Gates the user approved. See [§ Token budget](#token-budget) for which part of
the plan each agent gets.

**Why tests are a separate agent.** A model that writes the code and its tests
tends to shape the expected values to whatever the code returns — up to 68% of
suites from coverage-driven LLM test generators "validate bugs" instead of
catching them ([arXiv 2412.14137](https://arxiv.org/abs/2412.14137)); Meta's
TestGen-LLM keeps a generated test only when it builds, passes reliably and
adds coverage ([arXiv 2402.09171](https://arxiv.org/abs/2402.09171)). So
test-writer takes its oracles from the plan, and must show each test going red
without the behaviour. Mutation testing (Stryker) would be stronger, but it is
a new dependency; the red-proof worktree needs none.

**When tests are written: T1 and T2** (user decision 2026-10-05). test-writer
runs twice per plan. **T1, before the implementer:** the plan's `[T1]` lines —
happy-path acceptance tests at a seam the plan fixes in § Contract (a route via
`app.inject`, an MCP tool, an existing page, a component whose name and props
the Contract names) — proven red on today's tree, on an assertion. The
implementer makes them pass and cannot edit them. **T2, after it:** `IF … THEN`
criteria, edges and units, plus a mutation red-proof of every T1 test now green.
Why this split:

- Spec Kit's tasks template: tests "FIRST, ensure they FAIL before
  implementation" ([tasks-template.md](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md));
  Anthropic: "have one Claude write tests, then another write code to pass
  them" ([Claude Code best practices](https://code.claude.com/docs/en/best-practices));
  the outer acceptance loop of double-loop TDD binds only to the public
  contract, so it can be written before the code (Freeman & Pryce, *GOOS*).
  Unit tests bind to seams the implementer chooses, so they stay after it.
- Visible tests get gamed: on ImpossibleBench ([arXiv 2510.20270](https://arxiv.org/abs/2510.20270))
  models special-case or edit tests to pass them, read-only tests remove the
  editing, hidden tests remove most of the rest *(M — figures from a summary)*.
  Hence: the guard keeps tests read-only for the implementer, its rule 6 says
  "a wrong test is a deviation, never a workaround" (after Anthropic's
  [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices),
  "Avoid focusing on passing tests and hard-coding"), and T2 is the held-out
  set — the implementer never sees it, so "T1 green, T2 red" is a signal
  plan-verifier names.
- Rejected: all tests first (unit tests could only fail on a missing import,
  and all of them would be visible to game); test-writer in parallel with the
  implementer (no source recommends it; both would guess the same seams). No
  controlled study of test-first vs test-after for multi-agent, repo-level work
  was found — measure it with `workflow-retro` (fix rounds, plan-verifier FAILs,
  `red:assertion` vs `red:compile`, suspected defects).

**architecture-reviewer vs `/pr-self-review`.** Same rules, different stage.
The reviewer runs before the commit, on the working tree, on boundaries only
(groups A and C plus reviewer-core and the vendored twins), and writes nothing.
`/pr-self-review` runs on the committed branch, covers every group including
security, and writes the report the push gate reads. The reviewer reuses the
gate's `routing.md`, `greps.md` and `reviewer-prompt.md` by reference, so both
calibrate the same way; a clean architecture review does not replace the gate.

**security-reviewer vs `/pr-self-review` group E vs the built-in
`/security-review`.** The same split again. security-reviewer runs before the
commit, on the working tree, writes nothing and blocks nothing; group E runs
on the committed branch and its CRITICALs block the push. Both grade with
`docs/agent-prompts/security-reviewer.md` (the product's own prompt) and the
same CRITICAL bar, so a finding does not change severity between the two.
security-reviewer adds what a pre-commit pass can afford: exploitability
fields on every finding, an exclusion list and a confidence threshold after
Anthropic's [`claude-code-security-review`](https://github.com/anthropics/claude-code-security-review),
and a second pass that tries to break each finding. The built-in
`/security-review` is generic — it knows neither this stack nor this repo's
scale — and neither replaces nor is replaced by the other two. A tenancy
hit (`onion-13-tenancy-guard`) may be reported by both reviewers; the main
session merges them when relaying.

**spec-creator vs implementation-planner vs doc-writer.** All three write
about one feature at different times. spec-creator writes the intent before
anything is planned — WHAT and WHY plus the contract between packages, as
EARS criteria with a source each — and is the only agent that writes specs.
implementation-planner reads the spec and decides HOW; it reviews the spec
(`R-n`) but never edits it, and an open `[NEEDS CLARIFICATION]` stops it.
doc-writer describes what was built, after the fact. When a design choice
blocks the spec, spec-creator marks it and the main session may run
brainstormer before answering.

**brainstormer vs researcher vs implementation-planner.** researcher answers one question
with evidence; brainstormer makes the options for one decision comparable;
implementation-planner plans one chosen design. brainstormer goes first only when there is
a real choice (implementation-planner's Step 0 otherwise stops at "a decision between A and
B"), has no web tools and hands external unknowns to researcher, and ends
with a **Handoff to implementation-planner** block: the decision, the user's pick, the
drivers to honour and each rejected option — which implementation-planner copies into its
Decisions table as the rejected alternatives.

**plan-verifier vs the implementer's own check.** The implementer's "check the
diff against the plan" is a self-assessment and its report is a claim;
plan-verifier re-derives every verdict from the code and from commands it runs
itself, on a different model. Per-item binary grading is used instead of a
holistic score because it agrees with human judgement markedly better
(CheckEval, [arXiv 2403.18771](https://arxiv.org/abs/2403.18771); TICK,
[arXiv 2410.03608](https://arxiv.org/abs/2410.03608); Anthropic,
[develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)).

## Token budget

To measure a run, use the [`workflow-retro`](../skills/workflow-retro/SKILL.md)
skill: per-agent tokens, cache, time and cost from the transcripts, findings
against the rules below, and one row per run in
[`docs/retros/ledger.md`](../../docs/retros/ledger.md). Subagent transcripts
miss part of the output tokens — its § Transcript format says how they are estimated.

Measured on the L03 Intent Layer run, 2026-09-24 (subagent totals from the
harness's task notifications — compare stages with each other, not as bills):

| Stage | Model | Tokens | Tool calls |
|---|---|---|---|
| researcher | sonnet | 38k | 14 |
| planner (now implementation-planner) | opus | 235k | 68 |
| implementer, WP0–WP8, three packages | sonnet | **417k** | **222** |
| architecture-reviewer | opus | 108k | 34 |
| plan-verifier | opus | 155k | 44 |
| implementer, fix round | sonnet | 192k | 80 |

**Measured again on 2026-10-01** (same L03 feature, per-turn `usage` fields from
every transcript — cache read is what each turn re-reads from the prompt cache,
so it tracks turns × context):

| Stage | Model | Turns | Cache write | Cache read |
|---|---|---|---|---|
| main session | opus | 127 | 0.39M | 35.5M |
| researcher | sonnet | 5 | 44k | 0.13M |
| planner (now implementation-planner) | opus | 67 | 215k | 8.4M |
| implementer | sonnet | 39 | 194k | 4.9M |
| architecture-reviewer r1 / r2 | opus | 35 / 37 | 135k / 163k | 3.1M / 4.0M |
| plan-verifier r1 / r2 | opus | 37 / 33 | 134k / 127k | 3.0M / 2.9M |
| security-reviewer | opus | 34 | 119k | 2.6M |
| implementer fix rounds ×2 | sonnet | 7 + 5 | 56k + 38k | 0.28M + 0.13M |

1. **Cache reads, i.e. turns × context, dominate cost.** Written tokens are small;
   the same context re-read on every turn is not.
2. **The main session cost as much as all 10 agents together.** Its context grew
   from 47k to 413k, so every late main-session turn cost about 3–4 agent turns.
3. **Reviews and verification were 54% of subagent cost** (both architecture
   rounds, both plan-verifier rounds, security-reviewer).
4. **Within an agent the cache works** (24× read/write). **Across spawns it never
   hit:** the first turn's `cache_read_input_tokens` was 0 on all 10 spawns,
   including repeat spawns of the same type. Cause not separated (the 5-minute
   TTL versus a prefix that differs between spawns).

First runs of the two newer agents, 2026-09-28 (behaviour probes, not a
feature run): security-reviewer on a one-file, 9-line change — opus, 27k, 7
calls; brainstormer on a five-option `.claude/` decision — opus, 67k, 19 calls.

Where it went: a ~25–30k-token plan, a quarter of it test cases nobody in that
iteration needed, was read by five agents and the main session; every full
report landed in the main session's context and rode along on each later turn;
the same code was explored from scratch five times; the same typecheck and
tests ran four times on one tree; one implementer carried server **and**
client reads through 222 calls; and an `.it.test` run against real stored keys
cost billed calls plus a debugging round. The changes below remove the
repetition, not a check.

**What each agent reads**

| Agent | Gets | Does not get |
|---|---|---|
| implementer | plan above `<!-- test-brief -->` (its header carries the approval); the T1 test files by path, from T1's Handoff to implementer | Test brief, the T2 tests; in a fix round, the plan at all — only the findings |
| test-writer | T1: the whole plan (seams from § Contract; there is no code yet). T2: the same agent continued, + the implementer's handoff | — |
| plan-verifier | plan above the marker (+ Test brief when tests are in the iteration), what is deferred; `scripts/change-set.sh`; `scripts/checks.sh` results cited by package key | reports as evidence (they are claims) |
| architecture-reviewer | nothing or a range; `scripts/change-set.sh` → hunks, `scripts/review-greps.sh` → new hits; in a re-review the delta (`--since`) plus direct callers | whole modified files, typecheck/test runs |
| security-reviewer | nothing or a range; `scripts/change-set.sh` → hunks, `scripts/review-greps.sh` (two `greps.md` rows, new secret-pattern hits); follows data beyond the hunk only to a source or sink; the spec's § Non-functional and § Contract when given (paths to trace first, never a reason to skip one); in a re-review the delta plus direct callers | the plan, typecheck/test runs |
| brainstormer | the decision, its scope and outcome; optionally a researcher report | a plan (it comes before one) |

**Rules for the main session**

1. **Do not re-type a plan.** Save it once as `docs/plans/<spec file name>`
   ([docs/plans/README.md](../../docs/plans/README.md): header, status, who
   approves) and hand agents the **paths**. An over-limit message is already saved by the harness. An
   inline one arrives as the `message` input of the agent's `SubagentHandback`
   tool call — extract it from the agent's `output_file` with a script that
   writes the file and prints only its size, never by reading the transcript
   (measured 2026-09-24: the transcript's last plain assistant text was a
   3.8k-char fragment, the handback held the 39k-char plan). Relay its
   `## Summary` (`sed -n '/^## Summary/,/^## Goal/p' <file>`) and cut it at
   the marker (`awk '/<!-- test-brief -->/{exit} {print}' <file> > plan-core.md`).
   **When tests are deferred, always cut:** every agent gets `plan-core.md`; the
   Test brief goes only to test-writer (and to plan-verifier when tests are in
   the iteration). Five agents and the main session each re-read a ~25–30k plan
   on every turn; a quarter of it was test cases nobody in that iteration needed.
2. **Ask before launching the implementer**, even after the Gates are
   answered — it is the most expensive stage, and a stop after it started
   wastes everything it read. Ask it together with the plan's execution-mode
   question (multi-agent or single-agent); in a single-agent pass no
   implementer is launched at all.
3. **A fix round gets a self-contained brief** — each finding with `file:line`,
   the rule and what must hold — and no plan (`implementer.md` Step 1).
4. **Who runs which checks.** The per-package CI commands
   (`.github/workflows/*.yml`) run through `scripts/checks.sh` (rule 11) in the
   implementer, at the end of test-writer and in plan-verifier (its evidence
   must be its own — a ledger result for the same package key is).
   architecture-reviewer and security-reviewer run none. The server
   `.it.test` suite runs only through `checks.sh`, which isolates it from real
   keys (§ Running the integration suite without real keys); test-writer runs
   a single `.it` file through the same recipe by hand.
5. **Relay, do not re-read.** Report the verdict, counts and non-PASS items to
   the user; open the full report only when asked, and never paste a full
   report back into a later delegation prompt (a fix round gets findings only,
   rule 3). Rule 9 says how the report reaches a file without entering the
   main context.
6. **Do not rely on a stable prefix; continue the agent instead.** The earlier
   advice (start every delegation prompt with the same constant block so the
   prompt cache matches on prefixes) is **contradicted by measurement**: on
   2026-10-01 the first turn's `cache_read_input_tokens` was 0 on all 10
   spawns, repeat spawns of the same type included (cause not separated: the
   5-minute TTL or a differing prefix — the system prompt may embed git
   status). Cross-spawn caching does not happen here, so a fresh spawn always
   pays full price for its context. To run the same agent again — a re-review,
   a second verification, a fix round's check — **continue it with
   `SendMessage`** and the delta only (rule 10); inside one agent the cache
   works (24× read/write), which is the only caching you can count on.
7. **One agent per context.** Split the implementer by package when server and
   client work do not share files (the client run then does not carry server
   reads); keep sequential stages that share context in one agent.
8. **Bundled artifacts:** never `Artifact read` a bundler page into the main
   context (it returns base64) — save it and unpack with a script, then grep.
   On 2026-10-01 one such read put ~40k tokens into the main context, which
   rode along for ~100 turns ≈ 4M cache reads.
9. **Reports to file.** Save an agent's full report from its `output_file` with
   a script (the `SubagentHandback` message, rule 1), and read only the verdict,
   the counts and the non-PASS rows into the main session. Open the full report
   only when the user asks.
10. **Re-review on the delta.** After each review round record
    `scripts/change-set.sh --snapshot` (a commit id for the exact tree that was
    reviewed; it touches no index, file or ref). The next round gets
    `scripts/change-set.sh --since <snapshot>` — only what changed — **plus the
    direct callers of every changed function**, and goes to the same agent via
    `SendMessage` where possible (rule 6). The callers are required: a
    delta-only re-review misses a pre-existing line that a fix newly exposes
    (2026-10-01: round 1 dropped a finding that round 2 then raised).
11. **One check ledger.** `scripts/checks.sh` replaces repeated runs: it keys the
    CI commands by each package's source key (`.git/devdigest/checks/<pkg>/<key>/`) and
    prints `cached` for a tree it has already checked. On 2026-10-01 the same
    typecheck and unit suites ran 8 times on near-identical trees. `--force`
    re-runs; `--no-it` skips the isolated `.it.test` suite; a SKIPPED result
    (no Docker) is never a pass and is never cached.
12. **The main session coordinates and does not grind.** Multi-step mechanical
    work — doc sweeps, serial edits, exploration — goes to an agent with a small
    context. About 25 main-session turns at ~350k context cost ≈ 0.9M cache
    reads; the same work in a ~30k-context agent costs ≈ 0.08M.
    **A `.claude/` change goes through the same flow.** No subagent may write
    `.claude/` (every guard denies it), so the edits stay in the main session —
    but the analysis does not have to: a read-only agent (researcher, Explore)
    audits the agents, skills and hooks and writes its findings as a plan the
    user approves (`docs/plans/`), and a **fresh** main session makes the edits
    from that file. Measured 2026-10-05 (`docs/retros/ledger.md`, SDD workflow
    hardening): the audit read ~2k lines of agent files plus this README into
    the main context, which then rode along 124 turns to a 409k peak — main
    $13.28, the one agent $0.16.
13. **Approval is a word from the user, written down.** A spec becomes
    `approved` and a plan becomes `approved` only when the user says so
    directly; the main session then edits the status line (and the plan's
    `**Approved:**` line) and commits. Never infer it from "go", "ok" on
    another question, or an answered `AskUserQuestion`. The implementer and
    plan-verifier read approval from the plan file, not from your prompt
    (user decision 2026-10-05).
14. **At most two fix rounds.** A fix round is one implementer (or
    test-writer) pass over verified findings plus the re-review of its delta.
    Log each in the plan's `## Run log`, so a new chat counts them too. After
    round 2, if a FAIL or a finding still stands, stop and give the user the
    open items: they choose another round, an `AM-n` amendment, or a waiver
    (user decision 2026-10-05).
15. **Record each reviewer's final round.** When architecture-reviewer or
    security-reviewer finishes its last round with `approve` or `comment`, run
    `scripts/review-record.sh add <reviewer> <verdict>` **before committing**
    (it keys the record by `HEAD` and the reviewed tree). `/pr-self-review`
    then skips the groups that record covers, file by file — a fix after the
    record re-opens only the files it touched. Never record a
    `request_changes`; the script refuses it, and the guards deny `add` to every
    subagent.

**Deliberately not done**

- **No model downgrades.** plan-verifier stays on opus: its value is
  re-deriving the implementer's (sonnet) claims on a different model (see
  "plan-verifier vs the implementer's own check" above). The savings come
  from shorter reports and passing paths instead of re-typed plans.
- **Read-only agents still do not write report files.** Letting implementation-planner,
  plan-verifier or architecture-reviewer write under `.git/devdigest/` would
  weaken the `read-only` guard; their reports got shorter instead (PASS rows
  as ID + evidence, deferred items as one line, scope as counts).

## Running the integration suite without real keys

`server/test/*.it.test.ts` builds the app with `loadConfig`, whose secrets
come from `~/.devdigest/secrets.json` and then from `OPENROUTER_API_KEY` /
`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GITHUB_TOKEN` / `GITHUB_PAT` in the
environment (`server/src/adapters/secrets/local.ts`). Any test that does not
inject `llm.<provider>`, `github` or `intent` then makes billed calls. Run
the suite with an empty `HOME` and those variables unset:

```sh
cd server
NODE_BIN="$(asdf which node 2>/dev/null || command -v node)"   # resolve BEFORE HOME changes
DOCKER_SOCK="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
FAKE_HOME=/tmp/devdigest-redproof-home1   # a literal devdigest-redproof- path: agent-scope-guard denies mktemp/rm elsewhere
mkdir -p "$FAKE_HOME"
env -u OPENROUTER_API_KEY -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u GITHUB_TOKEN -u GITHUB_PAT \
  HOME="$FAKE_HOME" DOCKER_HOST="$DOCKER_SOCK" \
  TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
  "$NODE_BIN" node_modules/vitest/vitest.mjs run .it.test     # or: run <file>
rm -rf "$FAKE_HOME"
```

`scripts/checks.sh` runs exactly this recipe for the full suite (and reports
SKIPPED, never PASS, when `docker info` fails); run it by hand only for a single
file. Why each line (verified 2026-10-01, 64/64 green, no secrets file present):
under a fake `HOME` the asdf `node` shim and Docker-context discovery both
break, so `node` is called by absolute path and `DOCKER_HOST` is passed
explicitly; testcontainers' Ryuk sidecar must mount the VM-side socket, hence
`TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`. Without Docker every file
self-skips — that is "skipped", never "passed".

## Where the rules come from

Most of the rules in these agents are not new policy. They restate
project rules, recorded traps and skills so a subagent cannot miss them. When a
source changes, the agent that restates it is now stale — this table says which.

### brainstormer

External sources were read on 2026-09-28; *(M)* marks what the research rated
medium confidence.

| Rule in [`brainstormer.md`](brainstormer.md) | Source |
|---|---|
| Output as context → drivers → considered options → pros and cons → outcome | [MADR](https://github.com/adr/madr); Nygard's ADR rejected as the shape (one decision, no side-by-side options) — [cognitect.com](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) |
| Drivers first, each with its source; justify every rejection; no strawmen | Zimmermann, [Ten common ADR mistakes](https://ozimmer.ch/practices/2026/09/12/ADRMistakes.html) ("criteria reverse-engineered from a preferred option", "a decision without alternatives is not a decision") |
| Titles before details; options from distinct angles; each detailed on its own | LLM idea fixation, [arXiv 2602.20408](https://arxiv.org/abs/2602.20408) *(M, preprint)*; [self-consistency](https://arxiv.org/abs/2203.11171); [Tree of Thoughts](https://arxiv.org/abs/2305.10601) (generate, then evaluate) |
| O0 status quo as the baseline; `++ … −−` relative to it, no weighted totals | Pugh / [decision matrix](https://en.wikipedia.org/wiki/Decision-matrix_method) *(M — a matrix practice, not an ADR rule)* |
| Options in generation order, ties allowed | Position bias in LLM judges, [IJCNLP 2025](https://aclanthology.org/2025.ijcnlp-long.18.pdf) *(M for Claude)* |
| 2–4 options | Anthropic, [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) ("direct comparisons … 2-4 subagents") *(M — an analogy)* |
| Recommendation as a Y-statement | [Y-statements](https://medium.com/olzzio/y-statements-10eb07b5a177) |
| No web; external unknowns → researcher | [`researcher.md`](researcher.md) § External research — method (one agent's source discipline) |
| `git log --all` for reverted lesson work, and say so | Root [`INSIGHTS.md`](../../INSIGHTS.md) 2026-09-23 |
| Handoff to implementation-planner | [`implementation-planner.md`](implementation-planner.md) Step 0 ("a decision between A and B") — the two files are coupled |

### spec-creator

External sources were read on 2026-10-03 through a researcher (fetches were
summarised, so quotes are not byte-exact); *(M)* marks medium confidence.

| Rule in [`spec-creator.md`](spec-creator.md) | Source |
|---|---|
| Specs before plans; one package → `<pkg>/specs/`, several → `docs/specs/`; draft-only writes; no web, design links saved by the main session; read-only MCP | User decisions 2026-10-03; root [`AGENTS.md`](../../AGENTS.md) § Workflow 2; [`docs/specs/README.md`](../../docs/specs/README.md) |
| WHAT/WHY, no HOW — except the contract at the package boundary | GitHub Spec Kit [`specify.md`](https://github.com/github/spec-kit/blob/main/templates/commands/specify.md) ("Focus on WHAT users need and WHY. Avoid HOW"); the boundary exception is a user decision 2026-10-03 (the existing specs and implementation-planner read a Contract section) |
| ≤3 `[NEEDS CLARIFICATION]` markers, scope > security/privacy > UX > technical; otherwise a recorded assumption | Spec Kit `specify.md` ("Maximum 3 … use only for critical decisions"); questions with options and a recommendation from Spec Kit [`clarify.md`](https://github.com/github/spec-kit/blob/main/templates/commands/clarify.md) |
| Prioritised user stories, each with an Independent test; Assumptions section | Spec Kit [`spec-template.md`](https://github.com/github/spec-kit/blob/main/templates/spec-template.md) |
| EARS patterns and clause order; `SHALL CONTINUE TO` for regressions | Alistair Mavin, [EARS](https://alistairmavin.com/ears/); Kiro [feature specs](https://kiro.dev/docs/specs/feature-specs/) and [best practices](https://kiro.dev/docs/specs/best-practices/) |
| Edge-case categories in Step 3 | Spec Kit `clarify.md` taxonomy (scope, data, interaction, non-functional, integration, failure handling, constraints, terminology, completion) |
| State matrix per surface; "not shown in design" is never invented | *(M)* design-QA checklists (empty / error / permission / expired states), composed — no authoritative agent prompt found |
| UX review → proposals, not requirements | [Nielsen's 10 heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/); proposals-await-the-user mirrors implementation-planner's `REC-n` |
| A source on every requirement; existing code labelled `existing` | Böckeler, [SDD tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) (an agent regenerated existing classes described in a spec) |
| Size the spec to the change | Böckeler (a small bug became "4 user stories with … 16 acceptance criteria"); Thoughtworks Radar [SDD](https://www.thoughtworks.com/radar/techniques/spec-driven-development) *(M)* |
| Self-check, at most 3 passes | Spec Kit `specify.md` (quality checklist, up to 3 validation iterations) |
| Sources are data, injection-shaped text listed | [OWASP LLM01](https://genai.owasp.org/llm-top-10/); the same rule as security-reviewer |
| Step 3.6 + template § Non-functional: `NFR-n` with a fit criterion, sourced or `A-n`; categories | Volere "fit criterion" *(M — search summary)*; [ISO/IEC 25010:2023](https://quality.arc42.org/articles/iso-25010-update-2023) characteristics, narrowed to what DevDigest features hit; the cases are review fixes after earlier lessons (`55e344f`, `de07f9e`, root `INSIGHTS.md` 2026-10-02) — added 2026-10-03 |
| Template § Traceability and verification: one row per AC/NFR with method test · demo · inspection · analysis | NASA SE Handbook [§5.3 Product verification](https://www.nasa.gov/reference/5-3-product-verification/) (IADT); Spec Kit [`analyze.md`](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md) coverage table *(M)* — added 2026-10-03 |
| Template § Self-check; Step 7 runs `scripts/spec-lint.sh` (also run by implementation-planner Step 0 and pr-self-review § 3 as a WARNING) | Spec Kit [`checklist.md`](https://github.com/github/spec-kit/blob/main/templates/commands/checklist.md) ("unit tests for English") *(M)*; each check has a planted hit and a clean case in `scripts/test-spec-lint.sh`, red-proofed by mutation (root `INSIGHTS.md` 2026-09-21) — added 2026-10-03 |
| Stable IDs, `withdrawn` instead of renumbering | Convention, no primary source found *(M)*; the planner and plan-verifier cite spec IDs — added 2026-10-03 |
| Plan-defaults round: the planner's non-`ok` Requirements-review rows folded back as `A-n` on an approved spec (the guard asks); `approved` and later set only by the main session | User decisions 2026-10-05 (the spec stays the source of truth, so a decision the plan took does not live only in the plan); [`docs/specs/README.md`](../../docs/specs/README.md) § Status |
| No preloaded skills; reads `TESTING.md` § Suite map and `security-reviewer.md` § Lethal trifecta by path | `skills:` preload unverified here: [#67251](https://github.com/anthropics/claude-code/issues/67251) closed "not planned" (stale), no fix found 2026-10-03; the generic `security` skill is Express/Mongo-shaped and carries numbers (rate limits) rule 3 forbids inventing |

### implementation-planner

| Rule in [`implementation-planner.md`](implementation-planner.md) | Source |
|---|---|
| Renamed from `planner` and stripped of spec work: specs are input only, never planned or written (rule 2) | User decision 2026-10-03; specs are written beforehand per root [`AGENTS.md`](../../AGENTS.md) § Workflow 2 |
| Step 0: review requirements (`R-n`: clear, complete, consistent, testable, needed) before reading code; blocking gap → questions instead of guessing | User decision 2026-10-03; subagents have no `AskUserQuestion` — [subagent docs](https://code.claude.com/docs/en/sub-agents); "verifiable requirement", ISO/IEC/IEEE 29148 (as in plan-verifier) |
| Step 0: find the spec in `docs/specs/` or `<pkg>/specs/`; no spec is non-blocking but stated | Root `AGENTS.md` § Workflow 2; [`docs/specs/README.md`](../../docs/specs/README.md) |
| Step 0: an open `[NEEDS CLARIFICATION]` in the spec is blocking; spec IDs are cited, `P-n` left out unless accepted | User decision 2026-10-03 (spec-creator → implementation-planner chain); [`spec-creator.md`](spec-creator.md) — the two files are coupled |
| Step 0: a spec not `approved` is blocking; every non-withdrawn spec `AC-n` / `NFR-n` is cited by an `R-n`; defaults stated so spec-creator can fold them back; plans are never output (rule 2) | User decisions 2026-10-05; [`docs/specs/README.md`](../../docs/specs/README.md) § Status, [`docs/plans/README.md`](../../docs/plans/README.md); [`plan-verifier.md`](plan-verifier.md) Step 5 — the files are coupled |
| Step 5: every Test brief line tagged `[T1]` (happy-path at a seam the Contract fixes, red on an assertion today) or `[T2]`; a WP's Done when includes its T1 tests | User decision 2026-10-05; [`test-writer.md`](test-writer.md) Step 0 — the files are coupled |
| Step 1: read `<pkg>/AGENTS.md` + `INSIGHTS.md`, note docs (not specs) to change | Root `AGENTS.md` § Workflow 1, 4; test plan from [`TESTING.md`](../../TESTING.md) |
| Step 2: search what already exists, including `git log --all` | Root [`INSIGHTS.md`](../../INSIGHTS.md) 2026-09-23 (reverted lesson work reachable only via `--all`) |
| Step 2: a Zod contract does not prove a route serves it | Root `INSIGHTS.md` 2026-09-19 (contracts with no server implementation) |
| Step 3: map every file to routing groups A–F and cite skill rules by § | [`pr-self-review/routing.md`](../skills/pr-self-review/routing.md) § Groups — the same table the pre-PR review uses; the §s are in each `../skills/<name>/SKILL.md` |
| Step 3: new module = `src/modules/<name>/` + registration; external calls via adapters + `mocks.ts`; `.it.test.ts` suffix | [`server/AGENTS.md`](../../server/AGENTS.md) § Must not break |
| Step 3: known onion exceptions (`pulls`, `polling`, `settings`, `workspace`) are not fixed in passing | [`onion-architecture`](../skills/onion-architecture/SKILL.md) §11 |
| Step 3: client data only via `lib/hooks/*` → `lib/api.ts`; UI strings in `messages/<locale>/` | [`client/AGENTS.md`](../../client/AGENTS.md); [`frontend-ui-architecture`](../skills/frontend-ui-architecture/SKILL.md) |
| Step 3: contracts change in both vendored copies; a reviewer-core change needs server checks | Root `AGENTS.md` § Cross-package invariants |
| Step 4 Gates: schema, migrations, lock files, dependencies | Root `AGENTS.md` § Do not touch; migrations are hand-written per [`docs/hand-written-migrations.md`](../../docs/hand-written-migrations.md) |
| Step 4 Gates: `package.json` changes | Root `AGENTS.md` § Lock files; `server/AGENTS.md` (`package.json` is skip-worktree) |
| Step 5: plan only what the implementer may do | [`implementer.md`](implementer.md) hard rules — the two files are coupled |
| Step 5: tests are test-writer's brief, written as Given/When/Then; no test file in a WP's Files | [`test-writer.md`](test-writer.md) Step 2 (oracles before the code); user decision 2026-09-24 to take tests away from the implementer |
| Step 5: every AC / Done when / Non-goal observable | [`plan-verifier.md`](plan-verifier.md) rule 4 — a vague item is graded UNVERIFIABLE; Given/When/Then per [Agile Alliance](https://agilealliance.org/glossary/given-when-then/) |
| Step 6: recommendations are listed, never folded into a WP until accepted | User decision 2026-10-03 (the planner advises how to do it better; the user decides) |
| Step 6: always ask multi-agent vs single-agent, with a recommendation; the size heuristic is not measured | User decision 2026-10-03; trade-off from [§ Token budget](#token-budget) (coordination cost) and "Why tests are a separate agent" (independent oracles) |

### implementer

| Rule in [`implementer.md`](implementer.md) | Source |
|---|---|
| Never touch migrations, lock files, dependencies; only `--frozen-lockfile` / `npm ci` | Root [`AGENTS.md`](../../AGENTS.md) § Do not touch |
| Never create `CLAUDE.md` / `CLAUDE.local.md` | Root [`INSIGHTS.md`](../../INSIGHTS.md) 2026-09-20 (one such file silently drops every `AGENTS.md`) |
| A guard denial is final; the guard decides `ask` when it cannot parse input | [`implementer-guard.sh`](../hooks/implementer-guard.sh); [`../hooks/README.md`](../hooks/README.md) § The `node` resolution problem (a hook that errors fails **open**) |
| Read the skill §§ the plan cites per WP, by path; a group with no cited § → its whole `SKILL.md` + a deviation; no Skill tool (2026-10-05) | [`pr-self-review/routing.md`](../skills/pr-self-review/routing.md) § Groups — so implementation and pre-PR review apply the same rules |
| Spec is input only, never edited; update listed docs in the same change | Root `AGENTS.md` § Workflow 2, 4; [`implementation-planner.md`](implementation-planner.md) rule 2 (user decision 2026-10-03) |
| Contracts in both copies, checked with `diff -r` | Root `AGENTS.md` § Cross-package invariants; `routing.md` § Vendored-contract twin check |
| No tests — hand them to test-writer, including intended breaks; `mocks.ts` stays the implementer's | User decision 2026-09-24; [arXiv 2412.14137](https://arxiv.org/abs/2412.14137) (one model writing both validates its own bugs); enforced by `implementer-guard.sh` |
| Step 3 verification commands per package | `server/AGENTS.md` § Commands, `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `TESTING.md` |
| A green `.it.test` run without Docker is "skipped", not "passed" | `TESTING.md` § server-integration (the tests self-skip) |
| Rule 7 + Step 3: `scripts/checks.sh --force` runs the per-package CI commands; the `.it.test` suite only through it (it isolates), never a bare run | [`server/INSIGHTS.md`](../../server/INSIGHTS.md) 2026-09-24 (real stored keys → billed calls, 10 s timeouts); [§ Running the integration suite without real keys](#running-the-integration-suite-without-real-keys) |
| Fix round works from the findings, not the plan; report restates nothing | [§ Token budget](#token-budget) |
| Step 0: executes only a plan whose status is `approved`/`in-progress`; Gates from its `**Approved:**` line, never from the prompt; `AM-n` amendments win; never edits specs, plans, `INSIGHTS.md` or `.git/`, and writes files only with Edit/Write | User decisions 2026-10-05; [`docs/plans/README.md`](../../docs/plans/README.md); the L04 retro (`docs/retros/ledger.md`: 32 heredoc writes past the guard); enforced by `implementer-guard.sh` |
| Rule 6: the T1 tests define done, not the solution — no hard-coded values or test-shaped branches; a wrong T1 test is a deviation, never edited or worked around | User decision 2026-10-05; Anthropic [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) ("Avoid focusing on passing tests and hard-coding"); ImpossibleBench [arXiv 2510.20270](https://arxiv.org/abs/2510.20270) *(M)* |
| Check `command -v agent-browser` before trusting an e2e run | [`e2e/INSIGHTS.md`](../../e2e/INSIGHTS.md) 2026-09-19 (the script exits 0 with 0 flows run) |
| reviewer-core change ⇒ run server checks too | Root `AGENTS.md` § Cross-package invariants |
| No `INSIGHTS.md` writes — report "Insight candidates" | Root `AGENTS.md` § Workflow 3: `engineering-insights` runs in the main session |
| No review, no `/pr-self-review` | [`docs/pr-self-review.md`](../../docs/pr-self-review.md) — review is a separate stage on the committed diff |

### test-writer

| Rule in [`test-writer.md`](test-writer.md) | Source |
|---|---|
| Test files only; a red test stays red and is reported | [pyor.review](https://pyor.review/blog/test-rewrite-failure-mode) (an agent blocked by a test rewrote the check to return true — practitioner report); `agent-scope-guard.sh` `test-writer` |
| `fireEvent` + `vi.mock`, no `user-event`, no MSW — overriding the RTL skill | [`client/INSIGHTS.md`](../../client/INSIGHTS.md) 2026-09-23 (not installed; lock files off-limits) |
| Oracles from the requirement, before reading the implementation | [arXiv 2412.14137](https://arxiv.org/abs/2412.14137) (oracles "designed to pass" validate bugs) |
| Skills per code under test, read by § | [`routing.md`](../skills/pr-self-review/routing.md) § Groups; [`onion-architecture`](../skills/onion-architecture/SKILL.md) §9; [`react-testing-library`](../skills/react-testing-library/SKILL.md) § Query Priority ([testing-library.com](https://testing-library.com/docs/queries/about/)); `fastify-best-practices/rules/testing.md` ([`app.inject`](https://fastify.dev/docs/latest/Guides/Testing/)) |
| Placement, `.it.test.ts`, typological coverage, hermetic mocks | [`TESTING.md`](../../TESTING.md) § Philosophy, § Conventions; `onion-architecture` §9 |
| Defect list: over-mocking, tautology, weak assertions, flake | the course author's reverted `test-quality-reviewer.md` (`git show 98eaf57:docs/agent-prompts/test-quality-reviewer.md`); [Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) |
| Client import traps (`@/`, depth to `messages/`) | [`greps.md`](../skills/pr-self-review/greps.md) (new deep relatives came from new tests); `client/INSIGHTS.md` 2026-09-22 |
| Three runs per new file; red-proof per test | [Meta TestGen-LLM](https://arxiv.org/abs/2402.09171) (keep only tests that pass reliably); mutation testing without Stryker (new dependency, root `AGENTS.md`) |
| T1 / T2 modes: `[T1]` acceptance tests before the implementer, red now on an assertion; `[T2]` after it; T1 tests mutation-proved in T2; a T1 test reported wrong is settled against the source of truth | User decision 2026-10-05; § "When tests are written: T1 and T2" (Spec Kit, Anthropic, GOOS, ImpossibleBench) |
| Execute every new e2e flow; `click` takes a selector | [`e2e/INSIGHTS.md`](../../e2e/INSIGHTS.md) 2026-09-22 |

### plan-verifier

| Rule in [`plan-verifier.md`](plan-verifier.md) | Source |
|---|---|
| Every item gets its own PASS / FAIL / UNVERIFIABLE; no score, no advice | CheckEval [arXiv 2403.18771](https://arxiv.org/abs/2403.18771), TICK [arXiv 2410.03608](https://arxiv.org/abs/2410.03608), [Anthropic develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests), [OpenAI graders](https://developers.openai.com/api/docs/guides/graders) |
| Step 5 Spec coverage: each spec `AC-n` / `NFR-n` → `R-n` → plan items, graded from the plan items' verdicts; `GT-n` from the `**Approved:**` line; `AM-n` graded | User decision 2026-10-05 (the plan was graded, the spec was not, so a dropped spec requirement went unseen); requirements traceability ([Jama](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/traceability-matrix/)) |
| Requirement → code evidence → test evidence | Requirements traceability matrix ([Jama](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/traceability-matrix/)) |
| Vague item ⇒ UNVERIFIABLE; restate as Given/When/Then | "Verifiable requirement", ISO/IEC/IEEE 29148 (paywalled — via secondary sources); [Agile Alliance](https://agilealliance.org/glossary/given-when-then/) |
| Item IDs follow the plan's sections | [`implementation-planner.md`](implementation-planner.md) § Output format — the two files are coupled |
| `.it.test` without Docker is UNVERIFIABLE; e2e needs `agent-browser` | `TESTING.md` § server-integration; `e2e/INSIGHTS.md` 2026-09-19 |

### architecture-reviewer

| Rule in [`architecture-reviewer.md`](architecture-reviewer.md) | Source |
|---|---|
| Finding = rule → `file:line` → quoted line → severity | [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) (rule, severity, location); [fitness functions](https://www.oreilly.com/library/view/building-evolutionary-architectures/9781491986356/ch02.html) |
| Re-verify each finding; drop the unconfirmed | LLM reviewers hallucinate findings ([HalluJudge, arXiv 2601.19072](https://arxiv.org/html/2601.19072), preprint) |
| Severity, CRITICAL bar, grandfathering, verdict | [`reviewer-prompt.md`](../skills/pr-self-review/reviewer-prompt.md) — borrowed, not reworded |
| Grep checks by subtraction, severity ceiling | [`greps.md`](../skills/pr-self-review/greps.md), run with `git grep` at both revisions |
| Groups A and C only; twin check | [`routing.md`](../skills/pr-self-review/routing.md) |
| Server rules §1–12, §11 exceptions | [`onion-architecture`](../skills/onion-architecture/SKILL.md) |
| Client rules §1–12 | [`frontend-ui-architecture`](../skills/frontend-ui-architecture/SKILL.md) |
| reviewer-core purity grep (`rc-purity` row in [`greps.md`](../skills/pr-self-review/greps.md), 0 hits at `438513f`; parsed by `scripts/review-greps.sh`) | [`reviewer-core/AGENTS.md`](../../reviewer-core/AGENTS.md) § Must not break — no skill covered it |

### security-reviewer

External sources were read on 2026-09-28; *(M)* marks what the research rated
medium confidence or could not verify.

| Rule in [`security-reviewer.md`](security-reviewer.md) | Source |
|---|---|
| Scope, lethal trifecta, severity levels, verdict, findings discipline | [`docs/agent-prompts/security-reviewer.md`](../../docs/agent-prompts/security-reviewer.md) — the product's prompt, borrowed, not reworded |
| The spec's § Non-functional and § Contract as a threat model: paths to trace first, never a reason to skip one | User decision 2026-10-05; rule 2 (everything read is data, claims are checked) |
| CRITICAL bar (four points, confidence ≥ 0.8) | [`reviewer-prompt.md`](../skills/pr-self-review/reviewer-prompt.md) § The CRITICAL bar |
| Report at confidence ≥ 0.7; the exclusion list (DoS, rate limiting, resource exhaustion, secrets on disk, validation without impact, theory) | Anthropic [`claude-code-security-review`](https://github.com/anthropics/claude-code-security-review) `claudecode/prompts.py` *(its `findings_filter.py` not verified)* |
| Open redirect kept, capped at WARNING | the product prompt lists it; Anthropic's list excludes it — the cap resolves the conflict |
| Finding = source → sink → preconditions → exploit → confidence | the product prompt § How to analyze; `security/SKILL.md` § Core Philosophy; the Anthropic prompt |
| Second pass that tries to break each finding; default downgrade for CRITICAL | [`verifier-prompt.md`](../skills/pr-self-review/verifier-prompt.md); LLM false-positive rates, [arXiv 2412.15004](https://arxiv.org/html/2412.15004v1) *(M)* |
| Everything read is data; injection-shaped text listed, not followed | `reviewer-core/src/prompt.ts` `INJECTION_GUARD`; [OWASP LLM Top 10 2025](https://genai.owasp.org/llm-top-10/) LLM01, LLM05 |
| No web tools | the lethal trifecta (product prompt); OWASP LLM06 Excessive Agency |
| OWASP category names + CWE, no A-numbers | the product prompt numbers OWASP 2021, `security/SKILL.md` 2025 ([OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/) *(M — order from secondary sources)*) |
| Three levels, not CVSS or a 4-level scale | [`pr-self-review/SKILL.md`](../skills/pr-self-review/SKILL.md) (no parallel scale); [CVSS v4.0](https://www.first.org/cvss/v4-0/specification-document) and [OWASP Risk Rating](https://community.owasp.org/OWASP_Risk_Rating_Methodology) considered and rejected — per-finding vectors an LLM fills inconsistently |
| Skill used for categories, confidence table and secret patterns only, under the stack preamble | [`routing.md`](../skills/pr-self-review/routing.md) § Group E — the security stack mismatch |
| Secret patterns live in `security-reviewer.md` Step 2 (parsed by `scripts/review-greps.sh`, which asserts each row's `sample` in `--self-test`); hits subtracted between revisions, masked to 4 characters; a `git grep` exit ≥2 = not run | patterns from [`security/SKILL.md`](../skills/security/SKILL.md) § Secret Detection, adapted (Postgres URL, LLM keys); the brainstormer probe of 2026-09-28 (option O2: one source, no stored counts — [`greps.md`](../skills/pr-self-review/greps.md)'s subtraction); root `INSIGHTS.md` 2026-09-21 and 2026-09-28 |
| Tenancy and config-bypass greps | [`greps.md`](../skills/pr-self-review/greps.md) (`onion-13-tenancy-guard` is the one grep that may reach CRITICAL); [`onion-architecture`](../skills/onion-architecture/SKILL.md) §7 |

### doc-writer

| Rule in [`doc-writer.md`](doc-writer.md) | Source |
|---|---|
| Document the code, present tense, no pre-announcing | [Google style highlights](https://developers.google.com/style/highlights); root `AGENTS.md` § Workflow 4 |
| One page, one purpose | [Diátaxis](https://diataxis.fr/) |
| Link, do not duplicate; README short, depth in `<pkg>/docs/` | `<pkg>/docs/README.md`; the course author's reverted `docs/README.md` (`git show 84e2c1e:docs/README.md`: "do not restate README.md, link to it"; intent → `specs/`) |
| ADRs in `<pkg>/docs/adr/NNNN-<title>.md` | `<pkg>/docs/README.md`; [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html), [adr.github.io](https://adr.github.io/) |
| Intent goes to specs, not docs; one spec per cross-package feature, in `docs/specs/` | `<pkg>/specs/README.md`; [`docs/specs/README.md`](../../docs/specs/README.md) |
| Never specs or plans — the guard denies `docs/specs/**`, `<pkg>/specs/**`, `docs/plans/**`; a mismatch goes under Discrepancies | User decision 2026-10-05 (specs are spec-creator's, plans the main session's) |
| INSIGHTS.md read-only, settled entries proposed for promotion | Root [`INSIGHTS.md`](../../INSIGHTS.md) header ("settled knowledge moves to docs/"); `engineering-insights` |
| Mermaid in markdown, type by content, one C4 level | [`mermaid-diagram`](../skills/mermaid-diagram/SKILL.md); [GitHub renders Mermaid](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams); [C4](https://c4model.com/) |

### External sources for the set as a whole

The design follows the official
[subagent docs](https://code.claude.com/docs/en/sub-agents) (focused agents,
least-privilege `tools`, descriptions that single out one agent, `permissionMode`
precedence, frontmatter hooks), the
[skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
(third-person what + when descriptions, template outputs, feedback loops), and
Anthropic's [multi-agent guidance](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)
(verifiers that report every failure). That same post warns that splitting one
feature into implementation-planner → implementer phases costs coordination tokens; the split
is kept here because the plan is a human-approved gate, handed over once.

## The guards

Nine of the ten agents declare a `PreToolUse` hook in their frontmatter
(researcher, which has no Bash guard, is the tenth):

- `implementer` → [`../hooks/implementer-guard.sh`](../hooks/implementer-guard.sh)
  turns the "do not touch" rules of the root `AGENTS.md` into denials, denies
  test files (test-writer owns them), and asks the user before a
  `server/src/db/schema*` or `package.json` edit.
- `brainstormer`, `implementation-planner`, `test-writer`, `doc-writer`, `spec-creator`,
  `plan-verifier`, `architecture-reviewer`, `security-reviewer` →
  [`../hooks/agent-scope-guard.sh`](../hooks/agent-scope-guard.sh) with a
  profile argument (`test-writer`, `doc-writer`, `spec-creator`, `read-only`): the same deny
  core plus an allowlist of what that agent may write.

Decision tables and tests: [`../hooks/README.md`](../hooks/README.md).

**They only run in a trusted workspace.** Claude Code skips a project agent's
frontmatter hooks until the folder is trusted, and a `claude -p` session never
counts as trusted — there these agents run **unguarded**, with only their
prompts. Accept the workspace trust dialog before relying on them, and do not
run the writing agents from `-p` scripts. (Definitions passed with `--agents`
do run their hooks; that is how the guards are verified end to end.)

## Changing an agent

- **Change together:**
  - `docs/plans/README.md` (file name, header lines, statuses, Amendments and
    Run log above the marker) ↔ `implementation-planner.md` § Output format
    (the first three lines) ↔ `implementer.md` Step 0 (Status, `**Approved:**`)
    and Step 2 (Amendments) ↔ `plan-verifier.md` Step 1 (`GT-n`, `AM-n`) and
    Step 5 (the `**Spec:**` line) ↔ § The flow and Token budget rules 13–14 ↔
    the `docs/plans/` cases in both guards;
  - the spec statuses (`docs/specs/README.md` § Status, every
    `*/specs/_template.md`) ↔ `implementation-planner.md` Step 0 (not
    `approved` is blocking) ↔ `spec-creator.md` rule 2 and its plan-defaults
    round ↔ the status checks in `agent-scope-guard.sh` `spec-creator`;
  - `implementation-planner.md` Step 0 (every spec ID reaches an `R-n`) ↔
    `plan-verifier.md` Step 5 (Spec coverage) ↔ `scripts/spec-lint.sh` (the
    `- **AC-n**` / `- **NFR-n**` shapes both read);
  - `scripts/review-record.sh` ↔ Token budget rule 15 ↔ `pr-self-review/SKILL.md`
    § 4 (which groups a record covers, and which skills group A keeps) ↔
    `architecture-reviewer.md` Step 2 (the skills it reads) ↔ the `add` denial in
    both guards; run `scripts/review-record.sh --self-test` after a change;
  - `docs/specs/_template.md` (sections, `AC-n` / `A-n` / `P-n` IDs, the
    `**Status:** draft` line) ↔ `spec-creator.md` Steps 5 and 7 and its report ↔
    `implementation-planner.md` Step 0 (open markers block, IDs cited) ↔ the
    draft check in `agent-scope-guard.sh` `spec-creator` ↔ `scripts/spec-lint.sh`
    (the `- **AC-n**` / `| AC-n |` / `### US-n` / `| S-n |` shapes and the
    section headings it reads; run `scripts/test-spec-lint.sh` after a change);
  - `implementation-planner.md` Step 5 ↔ `implementer.md` hard rules ↔ `test-writer.md`
    (who writes tests, and the shape of a WP's Tests line);
  - the `[T1]` / `[T2]` tags (`implementation-planner.md` Step 5 and its Test
    brief example) ↔ `test-writer.md` Step 0 (mode), Step 4 (T1) and Step 5
    (T1 mutation in T2) and its report (Handoff to implementer, T1 tests
    corrected) ↔ `implementer.md` rule 6, Step 2 "Done when" and its `## T1
    tests` report section ↔ `plan-verifier.md` Step 3 ("T1 green, T2 red") ↔
    § The flow and § "When tests are written: T1 and T2";
  - `implementation-planner.md` rule 2 ↔ `implementer.md` Step 2 (the spec is
    input; neither plans nor edits it);
  - `implementation-planner.md` Step 6 ↔ § The flow and § Token budget rule 2
    (the execution-mode question the main session asks);
  - `implementation-planner.md` § Output format ↔ `plan-verifier.md` Step 1 (item IDs per
    plan section) ↔ `test-writer.md` Step 0 (the `<!-- test-brief -->`
    marker and the `WPn.tests` blocks after it);
  - `greps.md` § The patterns (row shape `id | pattern | pathspec | both revs |
    sample`, incl. `rc-purity`) ↔ `routing.md` § Vendored-contract twin check
    ↔ `architecture-reviewer.md` Step 3 ↔ `scripts/review-greps.sh` (it PARSES
    the tables and the secret table in `security-reviewer.md` Step 2 — change a
    table's shape and the parser together, then run `review-greps.sh --self-test`);
    the commands in `.github/workflows/*.yml` ↔ `scripts/checks.sh` (its
    header is the ONLY list of packages and CI commands — `implementer.md`
    Step 3 and `plan-verifier.md` Step 4 point at it, and `test-writer.md`
    Step 4 lists only how to run single new files, one row per package);
    `scripts/change-set.sh` ↔ Step 1 of both reviewers, `plan-verifier.md`
    Step 2, `implementer.md` Step 3 (and `checks.sh`, which keys its ledger by
    `change-set.sh --tree`); the scripts' names ↔ the allow cases in
    `../hooks/test-agent-scope-guard.sh` and `../hooks/test-implementer-guard.sh`;
  - `implementer.md` report ↔ `test-writer.md` input ("Handoff to
    test-writer") ↔ `plan-verifier.md` rule 2;
  - `routing.md` § Groups is the only file → skill table: `implementer.md`
    Step 1 reads the §§ the plan cites (`implementation-planner.md` Step 3.4
    cites one per group) and falls back to the group's whole skill;
    `test-writer.md` Step 1 and `architecture-reviewer.md` Step 2 keep only
    which SECTIONS they read, one row per package incl. `mcp-server`; `architecture-reviewer.md`
    ↔ `greps.md` and `reviewer-prompt.md`;
  - `implementer.md` rules 2 and 5 ↔ `implementer-guard.sh`; each new agent's
    hard rules ↔ its `agent-scope-guard.sh` profile; both guards' deny core
    ↔ root `AGENTS.md` § Do not touch;
  - `security-reviewer.md` ↔ `docs/agent-prompts/security-reviewer.md`
    (scale, verdict, trifecta) ↔ `reviewer-prompt.md` § The CRITICAL bar ↔
    `routing.md` § Group E (the stack preamble, quoted verbatim) ↔
    `reviewer-core/src/prompt.ts` `INJECTION_GUARD` ↔ `greps.md` row ids
    `onion-13-tenancy-guard`, `onion-13-config-bypass`;
  - the secret patterns in `security-reviewer.md` Step 2 ↔ `security/SKILL.md`
    § Secret Detection ↔ `routing.md` § Groups row E and
    `pr-self-review/SKILL.md` § 3;
  - `brainstormer.md` § Handoff to implementation-planner ↔ `implementation-planner.md` Step 0 (brainstormer
    report + the user's pick) and § Decisions taken (rejected alternatives);
  - `test-writer.md` rule 3 ↔ `client/INSIGHTS.md` 2026-09-23 (remove the
    override if `user-event` / `msw` are ever installed).
- **Check that it loaded — from a fresh session.** No `claude` is on `PATH` in a
  VSCode-extension session, but `$CLAUDE_CODE_EXECPATH` points at the
  extension's native binary, so a fresh headless session is
  `"$CLAUDE_CODE_EXECPATH" -p '…' --output-format stream-json --verbose`. It
  inherits `.claude/settings.json`, but is never a trusted workspace (so no
  frontmatter hooks — see [the guards](#the-guards)).
  - **Loaded?** The `system/init` event's `agents` array lists every definition
    that parsed. `"$CLAUDE_CODE_EXECPATH" agents --json` does **not** help: it
    lists running sessions, not definitions.
  - **Right model?** Assistant events whose `parent_tool_use_id` is the
    subagent's `Agent` call carry `message.model`. A subagent that answers in
    one turn without a tool call (a `NEEDS CLARIFICATION` probe) emits **no**
    such event — read `message.model` from the transcript named by the
    `system/task_notification` event's `output_file`. Do check it: this is how
    `permissionMode: plan` was caught replacing `model: opus` with
    `claude-sonnet-5` (the planner ran on Sonnet until it moved to `default` + the
    read-only guard; it now runs on `claude-opus-5-5`, 2026-09-24, 2.1.281).
  - Never report such a check as done when it could not run.
