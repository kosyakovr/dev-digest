#!/usr/bin/env bash
# save-report.sh — save a subagent's final report to a file WITHOUT reading the
# transcript into the main session (.claude/agents/README.md § Token budget, rules 1 and 9).
#
#   save-report.sh <transcript.jsonl | agent-id> <dest.md>
#       Writes the agent's LATEST report to <dest.md> and prints only:
#         saved <dest.md> · <n> bytes · <n> lines · source: handback | text
#       followed by the report's head lines (Verdict:, Status:, Result:, Mode:,
#       Findings:, Counts:, the first heading) — the part the main session relays.
#       <agent-id> (e.g. a0deff0c578c40d0a, with or without "agent-") is looked
#       up as ~/.claude/projects/*/*/subagents/agent-<id>.jsonl.
#   save-report.sh --self-test
#
# Which report: an agent continued with SendMessage appends to the same
# transcript, so the LAST one wins — the last SubagentHandback `message` input,
# or, when the agent's last turn ended in plain text after it (no handback), the
# text blocks of that last turn. Measured 2026-10-05 on this repo's transcripts:
# most agents end with SubagentHandback ({"message": "<report>"}), some end in
# plain assistant text; the harness's tool_result after a handback carries no report.
#
# Needs python3 (stdlib json only). Exit: 0 saved, 1 no report found, 2 usage error.

set -u

extract() {
  python3 - "$1" "$2" <<'PY'
import json, re, sys
src, dest = sys.argv[1], sys.argv[2]
report, source = None, None
turn = 0                # bumped by every new prompt (the first, or a SendMessage)
handback_turn = -1
turn_text = []          # text blocks of the current assistant turn
for line in open(src, encoding="utf-8"):
    try:
        rec = json.loads(line)
    except ValueError:
        continue
    msg = rec.get("message") or {}
    content = msg.get("content")
    if rec.get("type") == "user":
        # a new prompt (not a tool result) starts a new turn
        is_tool_result = isinstance(content, list) and any(
            isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
        if not is_tool_result:
            turn += 1
            turn_text = []
        continue
    if rec.get("type") != "assistant" or not isinstance(content, list):
        continue
    for b in content:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "tool_use" and b.get("name") == "SubagentHandback":
            m = (b.get("input") or {}).get("message")
            if isinstance(m, str) and m.strip():
                report, source = m, "handback"
                handback_turn = turn
                turn_text = []
        elif b.get("type") == "tool_use":
            turn_text = []      # text before a tool call is narration, not the report
        elif b.get("type") == "text" and b.get("text", "").strip():
            turn_text.append(b["text"])
# plain text is the report only in a turn with no handback ("Done." after one is not)
if turn_text and turn > handback_turn:
    report, source = "\n\n".join(turn_text), "text"
if not report:
    sys.exit(1)
if not report.endswith("\n"):
    report += "\n"
with open(dest, "w", encoding="utf-8") as fh:
    fh.write(report)
lines = report.splitlines()
print("saved %s · %d bytes · %d lines · source: %s" % (dest, len(report.encode("utf-8")), len(lines), source))
head = re.compile(r"^\**(Verdict|Status|Result|Mode|Findings|Counts)\**\s*:", re.I)
first_heading = next((l for l in lines if l.startswith("#")), None)
if first_heading:
    print(first_heading)
for l in [l for l in lines if head.match(l)][:6]:
    print(l)
PY
}

resolve() {
  case "$1" in
    *.jsonl) [ -f "$1" ] && { printf '%s\n' "$1"; return 0; }; return 1 ;;
  esac
  id="${1#agent-}"
  found=$(find "$HOME/.claude/projects" -path "*/subagents/agent-${id}.jsonl" 2>/dev/null | head -1)
  [ -n "$found" ] && { printf '%s\n' "$found"; return 0; }
  return 1
}

self_test() {
  dir=$(mktemp -d "${TMPDIR:-/tmp}/save-report-test.XXXXXX") || exit 2
  fail=0
  # 1. handback only
  cat > "$dir/a.jsonl" <<'J'
{"type":"user","message":{"role":"user","content":"review this"}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Looking at the diff."},{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","content":"x"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SubagentHandback","input":{"message":"# Architecture Review: uncommitted vs HEAD\nVerdict: comment\nFindings: CRITICAL 0 · WARNING 1 · SUGGESTION 0\nbody"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","content":[{"type":"text","text":"{\"success\":true,\"message\":\"Report delivered to your caller.\"}"}]}]}}
J
  out=$(extract "$dir/a.jsonl" "$dir/a.md")
  printf '%s\n' "$out" | grep -q 'source: handback' || { echo "FAIL 1: source"; fail=1; }
  printf '%s\n' "$out" | grep -q '^Verdict: comment' || { echo "FAIL 1: verdict line"; fail=1; }
  grep -q 'Looking at the diff' "$dir/a.md" && { echo "FAIL 1: narration saved"; fail=1; }
  # 2. plain-text ending, narration before a tool call dropped
  cat > "$dir/b.jsonl" <<'J'
{"type":"user","message":{"content":"verify"}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Let me check."},{"type":"tool_use","name":"Read","input":{}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","content":"x"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"# Plan Verification\nResult: PASS"}]}}
J
  out=$(extract "$dir/b.jsonl" "$dir/b.md")
  printf '%s\n' "$out" | grep -q 'source: text' || { echo "FAIL 2: source"; fail=1; }
  grep -q 'Let me check' "$dir/b.md" && { echo "FAIL 2: narration saved"; fail=1; }
  grep -q '^Result: PASS' "$dir/b.md" || { echo "FAIL 2: report missing"; fail=1; }
  # 3. continued with SendMessage: the second handback wins over the first
  cat "$dir/a.jsonl" > "$dir/c.jsonl"
  cat >> "$dir/c.jsonl" <<'J'
{"type":"user","message":{"content":"re-review since abc123"}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"SubagentHandback","input":{"message":"# Architecture Review: delta\nVerdict: approve"}}]}}
J
  out=$(extract "$dir/c.jsonl" "$dir/c.md")
  grep -q '^Verdict: approve' "$dir/c.md" || { echo "FAIL 3: older report kept"; fail=1; }
  grep -q 'Verdict: comment' "$dir/c.md" && { echo "FAIL 3: reports merged"; fail=1; }
  # 4. a sign-off after the handback in the same turn does not replace it
  cat "$dir/a.jsonl" > "$dir/e.jsonl"
  printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"Done."}]}}' >> "$dir/e.jsonl"
  out=$(extract "$dir/e.jsonl" "$dir/e.md")
  grep -q '^Verdict: comment' "$dir/e.md" || { echo "FAIL 4: sign-off replaced the report"; fail=1; }
  # 5. no report at all -> exit 1, no file
  printf '%s\n' '{"type":"user","message":{"content":"hi"}}' > "$dir/d.jsonl"
  extract "$dir/d.jsonl" "$dir/d.md" >/dev/null; rc=$?
  [ "$rc" -eq 1 ] || { echo "FAIL 5: exit $rc, want 1"; fail=1; }
  [ -f "$dir/d.md" ] && { echo "FAIL 5: file written"; fail=1; }
  rm -rf "$dir"
  [ "$fail" -eq 0 ] && echo "self-test: 5/5 ok"
  return "$fail"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  ""|-h|--help) sed -n '2,22p' "$0"; exit 2 ;;
esac
[ $# -eq 2 ] || { echo "usage: save-report.sh <transcript.jsonl | agent-id> <dest.md>" >&2; exit 2; }
src=$(resolve "$1") || { echo "no transcript for: $1" >&2; exit 2; }
mkdir -p "$(dirname "$2")" || exit 2
extract "$src" "$2" || { echo "no report in: $src" >&2; exit 1; }
