#!/bin/sh
# PR Self Review — PreToolUse hook entry point.
#
# Why this wrapper exists at all: Claude Code spawns hooks with a shell whose PATH
# may be stripped of a version manager's shims. On this machine `node` is an asdf
# shim and `env -i sh -c 'command -v node'` finds nothing. A hook that exits
# non-zero is treated as an ERROR and the tool RUNS ANYWAY — so a missing `node`
# would silently open the gate, which is the worst possible failure for a gate.
#
# Therefore: resolve node from several well-known locations, and if it still cannot
# be found — or if the gate itself crashes — emit an explicit "ask" decision and
# exit 0. Fail safe, never fail open, never fail loud-but-blocking.
#
# CLI passthrough: with arguments (--digest, --status) this execs node directly.

set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GATE="$SCRIPT_DIR/pr-self-review-gate.mjs"

emit_ask() {
  # $1 = reason, already free of double quotes, backslashes and newlines.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  for candidate in \
    "$HOME/.asdf/shims/node" \
    "$HOME/.volta/bin/node" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node
  do
    if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  # nvm / fnm keep versioned trees; take the highest installed.
  for base in "$HOME/.nvm/versions/node" "$HOME/.local/share/fnm/node-versions"; do
    if [ -d "$base" ]; then
      version=$(ls -1 "$base" 2>/dev/null | sort -V | tail -1)
      if [ -n "$version" ]; then
        for suffix in "bin/node" "installation/bin/node"; do
          if [ -x "$base/$version/$suffix" ]; then printf '%s\n' "$base/$version/$suffix"; return 0; fi
        done
      fi
    fi
  done
  return 1
}

NODE=$(find_node) || emit_ask "PR Self Review: cannot run the gate - no node interpreter found on PATH or in the usual version-manager locations. The gate is NOT vouching for this change. Install node or disable the hook in .claude/settings.json."

# CLI mode (--digest / --status): no fail-safe wrapping needed, let it speak plainly.
if [ "$#" -gt 0 ]; then
  exec "$NODE" "$GATE" "$@"
fi

if [ ! -f "$GATE" ]; then
  emit_ask "PR Self Review: the gate script is missing at .claude/hooks/pr-self-review-gate.mjs. The gate is NOT vouching for this change."
fi

STDERR_FILE=$(mktemp 2>/dev/null || printf '%s' "/tmp/pr-self-review-gate.$$.err")
STDOUT=$("$NODE" "$GATE" 2>"$STDERR_FILE")
RC=$?
STDERR=$(cat "$STDERR_FILE" 2>/dev/null)
rm -f "$STDERR_FILE"

# The gate always exits 0 and prints its decision. A non-zero exit with no decision
# means it crashed before deciding - ask, rather than let the push through.
if [ "$RC" -ne 0 ] && [ -z "$STDOUT" ]; then
  DETAIL=$(printf '%s' "$STDERR" | tr -d '"\\' | tr '\n\r\t' '   ' | cut -c1-300)
  emit_ask "PR Self Review: the gate crashed (exit $RC) and decided nothing. It is NOT vouching for this change. Detail: $DETAIL"
fi

printf '%s' "$STDOUT"
exit 0
