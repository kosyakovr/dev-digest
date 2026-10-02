#!/usr/bin/env bash
# checks.sh — one ledger of package checks, keyed by what each package's checks read, so a
# stage does not re-run checks on code that has not changed.
#
#   checks.sh [--force] [--pkg reviewer-core|server|client|mcp-server]... [--no-it]
#
# Key, PER PACKAGE: a hash of the snapshot subtrees (working tree incl. untracked files,
# via `change-set.sh --tree`; the real index, tree and refs are not touched) that the
# package's checks compile: reviewer-core = reviewer-core/ + server/src/vendor/shared/,
# server = server/ + reviewer-core/, client = client/, mcp-server = mcp-server/. Edits in .claude/, docs/ or root
# files keep the cache valid. The keys are printed (first 12 chars) on the summary line.
# Ledger:   .git/devdigest/checks/<pkg>/<key>/<pkg>-<check>.log     full output
#                                             <pkg>-<check>.status  ONE line:
#                                             PASS|FAIL|SKIPPED exit=<n> <summary line>
# Without --force an existing PASS/FAIL status for this key is printed as `cached` and
# not re-run. A SKIPPED status is never reused (docker may be up next time).
#
# Checks = exactly the CI commands (.github/workflows/*.yml), each run inside its package:
#   reviewer-core  npm run typecheck | npm test
#   server         pnpm typecheck | pnpm exec vitest run --exclude '**/*.it.test.ts' | the .it.test suite
#   client         pnpm typecheck | pnpm test
#   mcp-server     pnpm typecheck | pnpm test
# The server .it.test suite runs ONLY isolated from real keys — the recipe in
# .claude/agents/README.md § Running the integration suite without real keys (fake HOME,
# key env vars unset, absolute node path and DOCKER_HOST resolved BEFORE HOME changes,
# TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE). `docker info` failing -> SKIPPED, never PASS.
# A green run that executed no passing test is SKIPPED too. --no-it skips it (no status
# written, so a later full run is not blocked).
#
# Output: a summary table (pkg/check, result, ran|cached, summary). Exit 1 if any FAIL,
# 2 on a usage or snapshot error, else 0.
#
# Bash 3.2 compatible. Never installs anything: missing node_modules is a FAIL with a hint.
#
# Expected on this repo (2026-10-01): first `checks.sh --no-it` runs 8 checks (4 packages) and prints
# "ran" for each; the same command again prints "cached" for all 8 (the ledger keys each package's sources,
# so the checks must not leave untracked, non-ignored files behind). Measured results:
#   reviewer-core  typecheck PASS, unit "Tests 23 passed (23)"
#   server         typecheck PASS, unit "Tests 147 passed (147)", it "Tests 64 passed (64)" (Docker up)
#   client         typecheck PASS, unit "Tests 165 passed (165)"
#   mcp-server     typecheck PASS, unit "Tests 153 passed (153)"
#   --no-it prints `server/it  SKIPPED  ran  --no-it`; Docker down prints SKIPPED with a reason.

set -u
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "checks.sh: not in a git repo" >&2; exit 2; }
cd "$root" || exit 2
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

force=0; noit=0; pkgs=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) force=1 ;;
    --no-it) noit=1 ;;
    --pkg)
      shift
      case "${1:-}" in
        reviewer-core|server|client|mcp-server) pkgs="$pkgs $1" ;;
        *) echo "checks.sh: --pkg takes reviewer-core|server|client|mcp-server" >&2; exit 2 ;;
      esac ;;
    -h|--help) sed -n '2,37p' "$0"; exit 0 ;;
    *) echo "usage: checks.sh [--force] [--pkg reviewer-core|server|client|mcp-server]... [--no-it]" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$pkgs" ] || pkgs="reviewer-core server client mcp-server"

tree=$("$HERE/change-set.sh" --tree) || { echo "checks.sh: could not snapshot the tree" >&2; exit 2; }
ledger_root="$(git rev-parse --absolute-git-dir)/devdigest/checks"

# Per-package key: the snapshot subtrees a package's checks actually read, so an edit in
# .claude/, docs/ or another package does not invalidate them. server compiles reviewer-core
# from source; reviewer-core aliases @devdigest/shared to server/src/vendor/shared.
subtree() { git rev-parse "$tree:$1" 2>/dev/null || echo missing; }
pkg_key() {
  case "$1" in
    reviewer-core) printf 'rc %s shared %s\n' "$(subtree reviewer-core)" "$(subtree server/src/vendor/shared)" ;;
    server)        printf 'server %s rc %s\n' "$(subtree server)" "$(subtree reviewer-core)" ;;
    client)        printf 'client %s\n' "$(subtree client)" ;;
    mcp-server)    printf 'subtree %s\n' "$(subtree mcp-server)" ;;
  esac | git hash-object --stdin
}

TABLE=$(mktemp "${TMPDIR:-/tmp}/checks-table.XXXXXX") || exit 2
trap 'rm -f "$TABLE"' EXIT
anyfail=0

ESC=$(printf '\033')
summary_of() { # logfile exit
  local s
  s=$(sed -E "s/${ESC}\[[0-9;]*[A-Za-z]//g" "$1" 2>/dev/null | grep -E 'Tests[[:space:]]+[0-9]|[0-9]+ passed|Test Files|error TS|ERR_|npm ERR|ELIFECYCLE' | tail -1)
  [ -n "$s" ] || [ "$2" -ne 0 ] || s="ok (exit 0, no errors reported)"
  [ -n "$s" ] || s=$(sed -E "s/${ESC}\[[0-9;]*[A-Za-z]//g" "$1" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -1)
  [ -n "$s" ] || { [ "$2" -eq 0 ] && s="ok (no output)" || s="no output"; }
  printf '%s' "$s" | tr '\t\r' '  ' | sed -E 's/^[[:space:]]+//' | cut -c1-140
}

record() { # pkg check result origin summary
  printf '%s\t%s\t%s\t%s\n' "$1/$2" "$3" "$4" "$5" >>"$TABLE"
  [ "$3" != FAIL ] || anyfail=1
}

run_cmd() { # pkg check -> runs the CI command inside the package
  case "$1/$2" in
    reviewer-core/typecheck) ( cd reviewer-core && npm run typecheck ) ;;
    reviewer-core/unit)      ( cd reviewer-core && npm test ) ;;
    server/typecheck)        ( cd server && pnpm typecheck ) ;;
    server/unit)             ( cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' ) ;;
    client/typecheck)        ( cd client && pnpm typecheck ) ;;
    client/unit)             ( cd client && pnpm test ) ;;
    mcp-server/typecheck)    ( cd mcp-server && pnpm typecheck ) ;;
    mcp-server/unit)         ( cd mcp-server && pnpm test ) ;;
  esac
}

# the integration suite, isolated from real keys (README recipe)
run_it() {
  local node_bin dock fake rc
  node_bin=$(asdf which node 2>/dev/null || command -v node)      # resolve BEFORE HOME changes
  dock=$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null)
  [ -n "$node_bin" ] || { echo "no node binary found"; return 2; }
  fake=$(mktemp -d "${TMPDIR:-/tmp}/checks-home.XXXXXX") || return 2
  ( cd server && env -u OPENROUTER_API_KEY -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u GITHUB_TOKEN -u GITHUB_PAT \
      HOME="$fake" DOCKER_HOST="$dock" \
      TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock \
      "$node_bin" node_modules/vitest/vitest.mjs run .it.test )
  rc=$?
  rm -rf "$fake"
  return $rc
}

do_check() { # pkg check
  local pkg=$1 chk=$2 st log res exit_n sm
  st="$ledger/$pkg-$chk.status"; log="$ledger/$pkg-$chk.log"
  if [ "$force" -eq 0 ] && [ -f "$st" ]; then
    read -r res rest <"$st"
    case "$res" in
      PASS|FAIL) record "$pkg" "$chk" "$res" cached "${rest#exit=* }"; return ;;
    esac
  fi
  if [ ! -d "$pkg/node_modules" ]; then
    printf 'FAIL exit=127 %s/node_modules missing (npm ci / pnpm install --frozen-lockfile)\n' "$pkg" >"$st"
    echo "$pkg/node_modules missing" >"$log"
    record "$pkg" "$chk" FAIL ran "$pkg/node_modules missing (npm ci / pnpm install --frozen-lockfile)"; return
  fi
  if [ "$chk" = it ]; then
    if ! docker info >/dev/null 2>&1; then
      echo "docker info failed: integration suite not run" >"$log"
      record "$pkg" "$chk" SKIPPED ran "docker unavailable (docker info failed): not run, NOT a pass"; rm -f "$st"; return
    fi
    run_it >"$log" 2>&1; exit_n=$?
  else
    run_cmd "$pkg" "$chk" >"$log" 2>&1; exit_n=$?
  fi
  sm=$(summary_of "$log" "$exit_n")
  if [ "$exit_n" -ne 0 ]; then res=FAIL
  elif [ "$chk" = it ] && ! grep -qE '[0-9]+ passed' "$log"; then res=SKIPPED; sm="no test passed (suite self-skipped?): $sm"
  else res=PASS; fi
  if [ "$res" = SKIPPED ]; then rm -f "$st"; else printf '%s exit=%s %s\n' "$res" "$exit_n" "$sm" >"$st"; fi
  record "$pkg" "$chk" "$res" ran "$sm"
}

keys=""
for pkg in $pkgs; do
  key=$(pkg_key "$pkg") || exit 2
  ledger="$ledger_root/$pkg/$key"
  mkdir -p "$ledger" || exit 2
  keys="$keys $pkg=${key%"${key#????????????}"}"
  do_check "$pkg" typecheck
  do_check "$pkg" unit
  if [ "$pkg" = server ]; then
    if [ "$noit" -eq 1 ]; then record server it SKIPPED ran "--no-it"; else do_check server it; fi
  fi
done

echo "checks: keys$keys  ledger $ledger_root/<pkg>/<key>"
awk -F'\t' 'BEGIN { printf "%-24s %-8s %-7s %s\n", "check", "result", "source", "summary" }
  { printf "%-24s %-8s %-7s %s\n", $1, $2, $3, $4 }' "$TABLE"
[ "$anyfail" -eq 0 ] || exit 1
exit 0
