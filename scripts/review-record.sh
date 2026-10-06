#!/usr/bin/env bash
# review-record.sh — lets /pr-self-review skip a group that architecture-reviewer
# or security-reviewer already reviewed, on exactly the content being pushed.
#
#   review-record.sh add <reviewer> <verdict> [<snapshot>]
#       MAIN SESSION ONLY, right after a reviewer's FINAL round and before any
#       commit. Records: reviewer, verdict, base = HEAD (with a snapshot: the
#       snapshot's parent, the base the reviewer diffed against), tree = the
#       reviewed working tree (change-set.sh --tree), the skills digest, the date.
#       reviewer: architecture-reviewer | security-reviewer
#       verdict:  approve | comment   (request_changes is refused: exit 1)
#       snapshot: optional change-set.sh --snapshot commit id the reviewer
#                 reported; its tree is recorded instead of the working tree
#                 as it is now. Not a commit: exit 2.
#   review-record.sh covered <reviewer> <merge-base> <path>...
#       Used by /pr-self-review step 3. Exit 0 and one line "covered …" when a
#       record of <reviewer> shows it reviewed these paths as they are at HEAD:
#         - the skills digest is unchanged,
#         - every path is identical in the recorded tree and in HEAD, and
#         - no path changed between <merge-base> and the recorded base, so the
#           reviewer's diff (base..tree) WAS the branch diff for these paths.
#       Exit 1 and one line "not covered: <reason>" otherwise.
#   review-record.sh --self-test
#
# Records: <git-dir>/devdigest/agent-reviews.tsv, one line per add, tab separated:
#   reviewer  verdict  base_sha  tree  skills_digest  recorded_at
# Comparing per path (not the whole tree) is deliberate: after the last review
# round the main session still writes docs, INSIGHTS.md and the plan's Run log,
# so the committed tree never equals the reviewed one.
#
# Bash 3.2 compatible. Exit: 0 ok/covered, 1 refused/not covered, 2 error.

set -u

self_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GATE="$self_dir/../.claude/hooks/pr-self-review-gate.mjs"

die() { echo "review-record.sh: $*" >&2; exit 2; }

node_bin() {
  command -v node 2>/dev/null && return 0
  asdf which node 2>/dev/null && return 0
  return 1
}

skills_digest() {
  local n
  n=$(node_bin) || die "node not found - cannot compute the skills digest"
  "$n" "$GATE" --digest || die "skills digest failed"
}

record_file() {
  local gd
  gd=$(git rev-parse --absolute-git-dir 2>/dev/null) || die "not in a git repo"
  printf '%s/devdigest/agent-reviews.tsv\n' "$gd"
}

check_reviewer() {
  case "$1" in
    architecture-reviewer|security-reviewer) ;;
    *) die "reviewer must be architecture-reviewer or security-reviewer, got: $1" ;;
  esac
}

cmd_add() {
  { [ $# -eq 2 ] || [ $# -eq 3 ]; } || die "usage: review-record.sh add <reviewer> <approve|comment> [<snapshot>]"
  check_reviewer "$1"
  case "$2" in
    approve|comment) ;;
    request_changes) echo "refused: a request_changes verdict covers nothing - fix, re-review, then record" ; exit 1 ;;
    *) die "verdict must be approve or comment, got: $2" ;;
  esac
  local base tree digest file
  if [ $# -eq 3 ]; then
    git rev-parse --verify -q "$3^{commit}" >/dev/null || die "snapshot is not a commit: $3"
    tree=$(git rev-parse "$3^{tree}") || die "cannot resolve the tree of snapshot $3"
    # the reviewer diffed snapshot^..snapshot, so the base is the snapshot's parent, not HEAD now
    base=$(git rev-parse "$3^") || die "snapshot has no parent: $3"
  else
    base=$(git rev-parse HEAD) || die "no HEAD"
    tree=$("$self_dir/change-set.sh" --tree) || die "change-set.sh --tree failed"
  fi
  digest=$(skills_digest) || exit 2
  file=$(record_file) || exit 2
  mkdir -p "$(dirname "$file")" || die "cannot create $(dirname "$file")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$base" "$tree" "$digest" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$file" || die "cannot write $file"
  printf 'recorded %s %s base %s tree %s\n' "$1" "$2" "$(printf %s "$base" | cut -c1-12)" "$(printf %s "$tree" | cut -c1-12)"
}

cmd_covered() {
  [ $# -ge 3 ] || die "usage: review-record.sh covered <reviewer> <merge-base> <path>..."
  check_reviewer "$1"
  local reviewer=$1 mb=$2 file digest line r v base tree d at reason=""
  shift 2
  git rev-parse --verify -q "$mb^{commit}" >/dev/null || die "unknown merge-base: $mb"
  file=$(record_file) || exit 2
  [ -s "$file" ] || { echo "not covered: no review records"; exit 1; }
  digest=$(skills_digest) || exit 2
  # newest record first (tail -r is BSD, tac is GNU - awk works on both)
  while IFS="$(printf '\t')" read -r r v base tree d at; do
    [ "$r" = "$reviewer" ] || continue
    if [ "$d" != "$digest" ]; then reason="skills changed since the review ($at)"; continue; fi
    if ! git cat-file -e "$tree^{tree}" 2>/dev/null || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
      reason="the reviewed tree of $at is gone (git gc)"; continue
    fi
    if ! git diff --quiet "$tree" HEAD -- "$@"; then reason="files changed after the review ($at)"; continue; fi
    if ! git diff --quiet "$mb" "$base" -- "$@"; then reason="the branch changed these files before the review base ($at) - the reviewer saw only part of the change"; continue; fi
    printf 'covered %s %s reviewed %s base %s tree %s\n' "$r" "$v" "$at" "$(printf %s "$base" | cut -c1-12)" "$(printf %s "$tree" | cut -c1-12)"
    exit 0
  done <<EOF
$(awk '{ l[NR] = $0 } END { for (i = NR; i >= 1; i--) print l[i] }' "$file")
EOF
  echo "not covered: ${reason:-no record by $reviewer}"
  exit 1
}

self_test() {
  local tmp pass=0 fail=0 out rc mb self
  self="$self_dir/review-record.sh"
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/review-record-test.XXXXXX") || die "mktemp failed"
  # the copy runs from the throwaway repo, so change-set.sh and the gate resolve there
  mkdir -p "$tmp/scripts" "$tmp/.claude/hooks" "$tmp/.claude/skills/s"
  cp "$self" "$self_dir/change-set.sh" "$tmp/scripts/" && cp "$GATE" "$tmp/.claude/hooks/" || die "copy failed"
  self="$tmp/scripts/review-record.sh"
  expect() { # want_rc name -- cmd...
    local want=$1 name=$2; shift 3
    out=$("$@" 2>&1); rc=$?
    if [ "$rc" -eq "$want" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); printf 'FAIL %s: want exit %s, got %s: %s\n' "$name" "$want" "$rc" "$out"; fi
  }
  (
    cd "$tmp" || exit 2
    git init -q -b main . && git config user.email t@t && git config user.name t
    echo rule > .claude/skills/s/SKILL.md; echo a > a.ts; echo d > doc.md
    git add -A && git commit -qm base
    mb=$(git rev-parse HEAD)
    git checkout -qb feature
    echo a2 > a.ts                                   # the reviewed, uncommitted change
    expect 1 "request_changes refused" -- "$self" add security-reviewer request_changes
    expect 2 "unknown reviewer"        -- "$self" add general-reviewer approve
    expect 1 "no records yet"          -- "$self" covered security-reviewer "$mb" a.ts
    expect 0 "add approve"             -- "$self" add security-reviewer approve
    git add -A && git commit -qm feat
    expect 0 "covered after commit"    -- "$self" covered security-reviewer "$mb" a.ts
    expect 1 "other reviewer"          -- "$self" covered architecture-reviewer "$mb" a.ts
    echo d2 > doc.md && git add -A && git commit -qm docs
    expect 0 "docs changed, a.ts not"  -- "$self" covered security-reviewer "$mb" a.ts
    expect 1 "doc.md itself changed"   -- "$self" covered security-reviewer "$mb" doc.md
    echo a3 > a.ts && git add -A && git commit -qm fix
    expect 1 "a.ts changed after"      -- "$self" covered security-reviewer "$mb" a.ts
    echo a4 > a.ts                                   # reviewed on top of the "fix" commit
    expect 0 "re-record"               -- "$self" add security-reviewer comment
    git add -A && git commit -qm fix2
    expect 1 "branch touched a.ts before the review base" -- "$self" covered security-reviewer "$mb" a.ts
    expect 0 "branch starts at the review base"           -- "$self" covered security-reviewer "$(git rev-parse HEAD~1)" a.ts
    echo a5 > a.ts                                   # a reviewed change, captured as a snapshot
    snap=$("$tmp/scripts/change-set.sh" --snapshot) || { echo "FAIL snapshot build"; exit 2; }
    recs="$(git rev-parse --absolute-git-dir)/devdigest/agent-reviews.tsv"
    expect 0 "add with a snapshot"     -- "$self" add architecture-reviewer approve "$snap"
    last=$(tail -n 1 "$recs")
    if [ "$(printf '%s\n' "$last" | cut -f3)" = "$(git rev-parse "$snap^")" ]; then
      pass=$((pass + 1))
    else
      fail=$((fail + 1)); echo "FAIL snapshot base recorded: not the snapshot's parent"
    fi
    if [ "$(printf '%s\n' "$last" | cut -f4)" = "$(git rev-parse "$snap^{tree}")" ]; then
      pass=$((pass + 1))
    else
      fail=$((fail + 1)); echo "FAIL snapshot tree recorded: not the tree of the snapshot"
    fi
    # HEAD moves after the snapshot: a path the new commit changed was never reviewed
    echo b > b.ts && git add b.ts && git commit -qm "head moved"
    expect 0 "add with a snapshot after HEAD moved" -- "$self" add architecture-reviewer approve "$snap"
    expect 1 "path changed by the moved HEAD not covered" -- "$self" covered architecture-reviewer "$mb" b.ts
    expect 2 "add with a bogus snapshot" -- "$self" add architecture-reviewer approve deadbeefnotacommit
    echo rule2 > .claude/skills/s/SKILL.md
    expect 1 "skills changed"         -- "$self" covered security-reviewer "$(git rev-parse HEAD~1)" a.ts
    printf '%s passed, %s failed\n' "$pass" "$fail"
    [ "$fail" -eq 0 ]
  )
  rc=$?
  rm -rf "$tmp"
  exit "$rc"
}

case "${1:-}" in
  add) shift; cmd_add "$@" ;;
  covered) shift; cmd_covered "$@" ;;
  --self-test) self_test ;;
  -h|--help|"") sed -n '2,30p' "$0" ;;
  *) die "unknown command: $1 (add | covered | --self-test)" ;;
esac
