---
name: workflow-retro
description: >-
  Retrospective of a FINISHED multi-agent run in this repo. Reads the session's
  Claude Code transcripts (~/.claude/projects, main + subagents), measures each
  subagent (tokens, cache hit, active time, tool calls, cost) and the run's
  parallelism, then finds problems: files several agents re-read, agents that went
  back to the orchestrator (NEEDS CLARIFICATION, BLOCKED, extra rounds), writes or
  attempts outside an agent's scope, skipped steps (INSIGHTS.md not updated,
  vendored contracts changed on one side, package INSIGHTS unread, no docs,
  serial reviewers). Prints a compact table and at most 5 action items "agent
  file → what to change", and appends one row to docs/retros/ledger.md.
  Recommends only — never edits agents, skills, hooks or AGENTS.md. Use after a
  planner → implementer →
  reviewers run, or when the user says "/workflow-retro", "ретро прогону",
  "ретроспектива", "розбери мультиагентний прогін", "скільки коштував прогін",
  "workflow retro", "retrospective of the run".
---

# Workflow retro

A run of the subagent flow (`.claude/agents/README.md` § The flow) leaves a full
record in the transcripts. This skill turns that record into numbers, problems and
**at most five** concrete changes, and keeps one ledger row per run so the trend
between runs is visible.

**What it writes:** one row in `docs/retros/ledger.md`, and a JSON report in the
scratchpad. Nothing else. Fixing what it finds is a separate step the user starts.

## Hard rules

1. **Recommend, never apply.** Do not edit anything under `.claude/` (agents,
   skills, hooks, settings), `AGENTS.md`, any `INSIGHTS.md`, specs or docs. An
   action item names the file and the change; the user decides.
2. **Never read a transcript into the context.** They are megabytes. All numbers
   come from `scripts/retro.mjs`; any drill-down is a `jq` on its JSON or a
   targeted `grep` that prints a few lines. Never `Read` a `.jsonl` or a
   `tasks/*.output` file.
3. **Every action item is backed by a finding you checked** (Step 3). A finding is
   a lead, not a verdict.
4. **The ledger is append-only.** Add rows only through the script (`--ledger`).
   Never edit or delete a row by hand: the script refuses a second row for the
   same run.
5. **Say what is estimated.** Subagent output tokens are partly estimated (see
   § Transcript format). When the script prints `≈` or `not calibrated`, the
   chat summary says so too.

## Step 1 — Run the script

```bash
node .claude/skills/workflow-retro/scripts/retro.mjs \
  --json <scratchpad>/retro-<session8>.json
```

- **Which session.** By default the script reads this session
  (`$CLAUDE_CODE_SESSION_ID`). If it reports `0 agents`, the run happened in an
  earlier session: re-run with `--session prev` (the newest other session that
  has subagents) or `--session <id>`, and tell the user which session you read
  (id, branch, date).
- **Which part of the session.** The window ends at this retro's invocation and
  starts at the previous retro in the same session, or at the session start. If
  one session holds several features, narrow it with `--since` / `--until`
  (ISO timestamps; take them from the human prompts:
  `jq -r 'select(.origin.kind=="human") | "\(.timestamp) \(.message.content|tostring|.[0:80])"' <session>.jsonl`).
- The script runs in ~0.2 s and prints the table, the parallelism line, a cost
  reconciliation and the findings `F1…Fn` (`crit` → `warn` → `info`), each with
  evidence and a suggested target.

## Step 2 — Read the numbers

| Column | Meaning |
|---|---|
| Turns | API calls (one `message.id` each) |
| Tokens | input + cache write + cache read + output, summed over the turns |
| Cache hit | cache read ÷ (input + cache write + cache read) |
| 1st-turn cache | cache read on the agent's first call; `0` = the spawn paid full price for its prompt. It is `0` on almost every spawn here (`.claude/agents/README.md` § Token budget, rule 6), so it is not a finding on its own |
| Active | the agent's span minus the idle gaps before each `SendMessage` continuation; `×N` = N rounds |
| Tools (err) | tool calls, of them errors (failed commands and guard denials) |
| Cost | from the price table in `retro.mjs`; `+?` = some calls on a model with no known price, which count as unknown, never as $0 |

Parallelism: **peak** = most agents running at once; **avg** = agent-time ÷ the
time at least one agent ran (1.0 = strictly serial); the wall time includes the
human's thinking time between prompts, so compare avg, not wall, between runs.

The `Harness cost-state` line compares the window's computed cost with the
harness's own session total. For a whole-session window they agree to within
~1% (measured on four runs, 2026-10-03); a large gap means the window cuts the
session, or the price table is stale (update `PRICES` in `retro.mjs` from the
`claude-api` skill).

## Step 3 — Verify the findings

For every finding you may turn into an action item, open its evidence in the
narrowest way and drop it if it does not hold. The usual checks:

| Finding | Check | Drop it when |
|---|---|---|
| `re-read` | `jq '.reRead[:10]' <json>` — who read it, how often | the readers needed different parts (e.g. reviewers reading hunks of a file the implementer wrote) |
| `re-ask` | the agent's hand-back: `jq -r 'select(.type=="assistant") \| .message.content[] \| select(.name=="SubagentHandback") \| .input.message' <subagents/agent-ID.jsonl> \| head -40` | the question was the user's to answer (a Gate), not missing input |
| `scope` (denied) | the denial text in the evidence | never drop; but a denial the agent recovered from is a prompt fix (tell it the allowed way), not a guard fix |
| `scope` (wrote outside) | `git log --stat` / `git diff --stat` for that path | the file was reverted before the commit — still report it, lower priority |
| `scope` (through the shell) | the agent's command for one listed file: `jq -r '… select(.name=="Bash") \| .input.command' <agent>.jsonl \| grep -m1 -B2 -A8 '<file>'` | the path is data in the command, not a write target (then it is a parser miss — say so) |
| `scope` (unplanned files) | the implementer report's `## Deviations from plan` | the deviation is listed there with a reason |
| `skipped` INSIGHTS read | `grep -n 'INSIGHTS' .claude/agents/<agent>.md` | the agent read it by a path form the script does not parse (say so) |
| `skipped` docs / spec | `git log --stat <range> -- '*.md'` | the docs landed in a later commit of the same run |
| `parallel` reviewers serial | the spawn times in `jq '.agents[] \| {type, spawnedAt}' <json>` | a reviewer needed another's result (stated in the delegation prompt) |
| `cost` main > agents | `jq '.main \| {turns, peakCtx, cost}' <json>` | the main session was debugging with the user (expected), not grinding |

`general-purpose` agents (pr-self-review groups, ad-hoc work) have no scope
profile, so only their reads, denials and cost are checked.

## Step 4 — Choose at most 5 action items

Rank by: `crit` first, then by the cost the problem caused (repeat-read tokens,
extra rounds, a fresh spawn instead of a continuation), then by how many runs it
recurs in (`docs/retros/ledger.md`). Merge findings with one cause into one item.
If fewer than five deserve a change, give fewer. "No changes" is a valid result.

Each item has exactly this shape:

```
N. <file> § <section or Step> → <what to change, concretely>
   because: F<ids> — <one-line evidence with a number>
```

Before you write an item, `grep -n` the section you cite so it names a real
place, and quote the current rule when the change contradicts or sharpens it.
Typical targets:

| Problem | Usually fixed in |
|---|---|
| plan / report re-read by many agents | delegation prompt per `.claude/agents/README.md` § Token budget rule 1 (WP excerpt, not the whole plan); `planner.md` § Output format if the plan itself is too long |
| a skill file re-read by several agents | `planner.md` Step 3 (put the binding § numbers in the WP so agents read sections, not whole files) |
| a source file re-read by reviewers | `architecture-reviewer.md` / `security-reviewer.md` Step 1 (hunks from `scripts/change-set.sh`) |
| NEEDS CLARIFICATION / BLOCKED | the agent's `## Step 0` / `## NEEDS CLARIFICATION` input list, and the main session's delegation prompt (what was missing) |
| extra rounds via SendMessage | rule 10 (delta only) or the agent's report format, if the round was spent re-asking for a missing field |
| guard denial the agent recovered from | the agent's `## Hard rules` (state the allowed way up front, e.g. the red-proof path) |
| project files written through the shell | the agent's `## Hard rules` (Edit/Write only) and its guard's Bash branch — the path rules (no tests for the implementer, ask before `schema`/`package.json`, test files only for test-writer) see only Edit/Write, and `python3 - <<EOF … open(p,'w')` passes every Bash pattern |
| write outside scope that went through | the guard in `.claude/hooks/` plus the agent's hard rules — always `crit` |
| package INSIGHTS not read before an edit | the agent's Step 1 (`implementer.md`, `test-writer.md`) or the main session (`AGENTS.md` § Workflow 1) |
| vendored contract changed on one side | `implementer.md` § Hard rules and the planner's WP for the contract |
| INSIGHTS candidates never captured | the main session's wrap-up (`AGENTS.md` § Workflow 3; `engineering-insights`) |
| raw test/typecheck runs | `implementer.md` Step 3, `test-writer.md` Step 4 → `scripts/checks.sh` (rule 11) |
| reviewers run one after another | the main session: launch them in one message (`.claude/agents/README.md` § The flow) |
| main session cost more than the agents | rules 5, 9, 12 (relay, reports to file, delegate grinding) |

## Step 5 — Report in the chat

Keep it compact; the full detail stays in the JSON.

1. One line: session id (8 chars), branch, window, number of agents.
2. The table from the script. With more than 12 agents, keep the named agents and
   fold the `general-purpose` rows into one line (count, turns, tokens, cost).
3. Parallelism and cost lines; say `≈` when outputs were estimated.
4. Problems: counts by kind (`re-read · re-ask · scope · skipped`) and the top
   few in one line each — only those you verified.
5. The action items (≤ 5).
6. The ledger row you appended (Step 6), and the JSON path.

## Step 6 — Append the ledger row

```bash
node .claude/skills/workflow-retro/scripts/retro.mjs <same --session/--since/--until> \
  --ledger docs/retros/ledger.md --run "<feature or lesson>" --note "<item 1, ≤ 80 chars>"
```

The row records date, `session@window-start`, branch, run name, agents, wall,
parallelism peak/avg, tokens, cache hit, cost and the finding counts by kind,
plus the top action. If the script says a row for that run already exists,
report that and stop. Compare the new row with the previous ones in the chat
when the trend says something (cost per agent, cache hit, re-asks going down or
up).

## Transcript format (what the script relies on)

Observed on Claude Code 2.1.287–2.1.288, 2026-10-03. When a version changes the
format, the self-test still passes but real runs show zeros; re-check these:

- Main transcript: `~/.claude/projects/<project path, non-alphanumerics → '-'>/<session>.jsonl`.
  Subagents: `<session>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json`
  (`agentType`, `description`, `toolUseId` = the main session's `Agent` call).
- One API call is written as several `assistant` lines (one per content block)
  that share `message.id` and repeat `usage`: count each id once.
- **Subagent output tokens are incomplete.** The main session writes a final line
  (`stop_reason` set) for every call; a subagent often keeps only a mid-stream
  snapshot (`output_tokens` ≈ 16, before thinking and the answer). Measured on a
  17-agent run: 59 of 70 test-writer calls had no final line. Input and cache
  fields are complete either way. The script estimates such a call's output as
  the mean of final calls in the same agent (or on the same model), then — when
  the session's `cost-state` record is fresh — scales the estimates per model so
  the session's output matches the harness's own total. The per-model totals then
  match `cost-state` to < 0.1%; the split between agents of one model stays an
  estimate.
- Prices: output already includes thinking; a cache write costs 1.25× input
  (5-minute TTL) or 2× input (1-hour TTL), split per call in
  `usage.cache_creation`. Verified against `cost-state.modelUsage` to the cent.
- A human prompt is a `user` line with `origin.kind == "human"`; task
  notifications have `origin.kind == "task-notification"`.
- A subagent's report is the `message` input of its `SubagentHandback` tool call;
  each round ends with one. A continuation arrives in the subagent transcript as
  a user string starting `The coordinator sent a message`.
- A guard denial is an error tool result starting
  `PreToolUse:<Tool> hook error: <guard name> (<profile>): <reason>`.
- **Writes through Bash** are found by `scripts/shell.mjs`: `>`/`>>` redirects,
  `tee`, `sed -i`, `cp`/`mv` destinations, `touch`, and python heredocs whose
  path reaches `open(…,'w')` (directly, via a variable, or as the first argument
  of a `def sub(p, …)` helper). Heredoc bodies are data — a `pnpm test` or a `>`
  inside one is neither a run nor a redirect. Paths with `$VAR`, globs or
  concatenation are skipped, not guessed, and a file the same agent later `rm`s
  is dropped. Writing agents here edit mostly this way (L04 Blast radius:
  implementer 39 files through the shell, 2 via Edit/Write), so these writes
  feed every write-based check: scope, package INSIGHTS, vendored twins,
  unplanned files.
- Agent scope profiles are read from each `.claude/agents/*.md` frontmatter
  (`agent-scope-guard.sh <profile>` / `implementer-guard.sh`; no hook and no
  Edit/Write in `tools` = read-only).

## Change together

- The scope rules in `retro.mjs` (§ 3, `isTest`, the protected-path regex) ↔
  `.claude/hooks/agent-scope-guard.sh` and `implementer-guard.sh`; if a guard
  starts denying shell writes, the "through the shell" finding should go quiet —
  check it does.
- The rule numbers cited in findings and in Step 4 ↔ `.claude/agents/README.md`
  § Token budget.
- The ledger columns ↔ the header of `docs/retros/ledger.md` ↔ the `row` in
  `retro.mjs`.

## Self-test

```bash
node --test .claude/skills/workflow-retro/scripts/retro.test.mjs
```

Builds a synthetic session in a throwaway `HOME` with planted problems (a write
outside scope by a read-only agent, a one-sided vendored contract, a missing
package-INSIGHTS read, serial reviewers, a fresh re-spawn, a `cd pkg && cat`
re-read, production files written by a python heredoc and `cat > f <<EOF`…) and
planted non-problems (a heredoc mentioning `pnpm test`, a vendored file written
and removed), asserts both, and unit-tests `shell.mjs` on the command shapes
that produced false positives on real runs. Expected: `pass 4`, `fail 0`.
Red-proofed 2026-10-03: disabling the twin check, the `cd` resolution, heredoc
stripping, shell-write tracking, the `rm` rule or the strict python rule each
fails a test.
