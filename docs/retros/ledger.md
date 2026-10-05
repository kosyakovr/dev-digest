# Workflow retro ledger

One row per finished multi-agent run, appended by the
[`workflow-retro`](../../.claude/skills/workflow-retro/SKILL.md) skill
(`retro.mjs --ledger`). Append-only: never edit or delete a row; the script
refuses a second row for the same run.

- **Run key** — `<session id, 8 chars>@<window start>`.
- **Wall** includes the human's time between prompts; compare **‖ avg** (agent
  time ÷ time any agent ran; 1.0 = serial) between runs, not wall.
- **Tokens / Cost** — input + cache write + cache read + output, priced per model.
  Subagent output tokens are partly estimated (calibrated to the harness's own
  total when it is available), so both are ≈.
- **Re-reads · Re-asks · Scope · Skipped** — how many findings of each kind the
  script raised (before verification); the trend matters, not the absolute value.

| Date | Run key | Branch | Run | Agents | Wall | ‖ peak / avg | Tokens | Cache hit | Cost | Re-reads | Re-asks | Scope | Skipped | Top action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-02 | `f69f800d@2026-10-02T14:32` | lessons/l04-3-blast-radius | L04 Blast radius | 14 | 2h39m | 3 / 1.2 | 91.0M | 97% | $39.05 | 8 | 1 | 3 | 6 | implementer: Edit/Write only + guard heredoc writes (32 bypassed the guard) |
| 2026-10-05 | `ce11aead@start` | lessons/l05-lab | SDD workflow hardening (.claude/ tooling) | 1 | 1h13m | 1 / 1.0 | 36.6M | 99% | $13.44 | 7 | 0 | 1 | 1 | README rule 12: .claude/ audit by read-only agent → file, edits in fresh session |
