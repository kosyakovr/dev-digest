#!/usr/bin/env bash
# change-set.sh — the change manifest every agent reads instead of rebuilding the diff.
#
#   change-set.sh                    uncommitted change vs HEAD, untracked files included
#   change-set.sh <base> <head>      a committed range
#   change-set.sh --snapshot         print ONE commit id capturing the CURRENT working tree
#                                    (untracked included) without touching the real index,
#                                    the working tree or any ref
#   change-set.sh --since <snap>     delta between a snapshot and the current working tree
#                                    (a re-review round reviews only this, plus direct callers)
#
# Output: one line per file, tab separated:  STATUS<TAB>path<TAB>ranges
#   STATUS  A | M | D | R   (untracked = A; R shows the NEW path)
#   ranges  new-side hunk ranges from `git diff -U0`, e.g. 12-40,88 ; an A file is 1-<lines>;
#           "-" when there is no new-side line (D, pure rename, binary, deletions only)
#
# Snapshot method: copy .git/index to a temp file, `GIT_INDEX_FILE=<tmp> git add -A`,
# `git write-tree`, `git commit-tree <tree> -p HEAD`, delete the temp index. The commit
# object is unreferenced (gc will collect it); no ref, index or file is changed.
# `change-set.sh --tree` prints the snapshot TREE hash (used by checks.sh as its ledger key).
#
# Bash 3.2 compatible. Exit: 0 ok, 2 error.
#
# Expected on this repo (2026-10-01, Intent Layer work uncommitted):
#   change-set.sh            ~60 lines incl. "A<TAB>server/src/modules/intent/service.ts<TAB>1-<n>"
#   change-set.sh --snapshot a 40-hex commit id;  change-set.sh --since <id>  -> empty output
#   git status --porcelain and `git stash list` identical before and after --snapshot

set -u

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "change-set.sh: not in a git repo" >&2; exit 2; }
cd "$root" || exit 2

snapshot_tree() { # prints the tree hash of the working tree (untracked included)
  local gitdir tmp tree
  gitdir=$(git rev-parse --git-dir) || return 2
  tmp=$(mktemp "${TMPDIR:-/tmp}/change-set-index.XXXXXX") || return 2
  if [ -f "$gitdir/index" ]; then cp "$gitdir/index" "$tmp" || { rm -f "$tmp"; return 2; }; else rm -f "$tmp"; fi
  tree=$(GIT_INDEX_FILE="$tmp" git add -A >/dev/null 2>&1 && GIT_INDEX_FILE="$tmp" git write-tree)
  local rc=$?
  rm -f "$tmp" "$tmp.lock"
  [ "$rc" -eq 0 ] && [ -n "$tree" ] || { echo "change-set.sh: snapshot failed" >&2; return 2; }
  printf '%s\n' "$tree"
}

snapshot_commit() {
  local tree
  tree=$(snapshot_tree) || return 2
  git -c user.name=snapshot -c user.email=snapshot@localhost \
    commit-tree "$tree" -p HEAD -m snapshot
}

emit() { # base head
  local base=$1 head=$2 ns df
  ns=$(mktemp "${TMPDIR:-/tmp}/change-set-ns.XXXXXX") || exit 2
  df=$(mktemp "${TMPDIR:-/tmp}/change-set-df.XXXXXX") || exit 2
  git -c core.quotepath=off diff --name-status -M "$base" "$head" >"$ns" || { rm -f "$ns" "$df"; echo "change-set.sh: git diff failed" >&2; exit 2; }
  git -c core.quotepath=off diff -U0 -M "$base" "$head" >"$df" || { rm -f "$ns" "$df"; echo "change-set.sh: git diff failed" >&2; exit 2; }
  awk -F'\t' '
    FNR == NR {                       # pass 1: name-status
      s = substr($1, 1, 1)
      if (s == "R" || s == "C") { path = $3; s = "R" } else { path = $2; if (s != "A" && s != "D") s = "M" }
      n++; st[n] = s; pa[n] = path; idx[path] = n
      next
    }
    /^\+\+\+ / {                      # pass 2: diff -> current file
      cur = $0; sub(/^\+\+\+ /, "", cur)
      if (cur == "/dev/null") cur = ""; else sub(/^b\//, "", cur)
      next
    }
    /^@@ / {
      if (cur == "") next
      h = $0
      sub(/^@@ -[0-9,]+ \+/, "", h); sub(/ @@.*$/, "", h)
      c = h; d = 1
      if (index(h, ",")) { split(h, p, ","); c = p[1]; d = p[2] }
      if (d + 0 == 0) next            # pure deletion: no new-side line
      r = (d + 0 == 1) ? c : c "-" (c + d - 1)
      rng[cur] = (cur in rng) ? rng[cur] "," r : r
      next
    }
    END {
      for (i = 1; i <= n; i++) {
        r = (pa[i] in rng) ? rng[pa[i]] : "-"
        if (st[i] == "D") r = "-"
        printf "%s\t%s\t%s\n", st[i], pa[i], r
      }
    }
  ' "$ns" "$df"
  rm -f "$ns" "$df"
}

case "${1:-}" in
  --snapshot) snapshot_commit || exit 2 ;;
  --tree)     snapshot_tree || exit 2 ;;
  --since)
    [ -n "${2:-}" ] || { echo "usage: change-set.sh --since <snapshot>" >&2; exit 2; }
    git cat-file -e "$2^{commit}" 2>/dev/null || { echo "change-set.sh: unknown snapshot '$2'" >&2; exit 2; }
    now=$(snapshot_commit) || exit 2
    emit "$2" "$now"
    ;;
  -h|--help) sed -n '2,24p' "$0" ;;
  "")
    now=$(snapshot_commit) || exit 2
    emit HEAD "$now"
    ;;
  *)
    [ $# -eq 2 ] || { echo "usage: change-set.sh [<base> <head> | --snapshot | --since <snapshot>]" >&2; exit 2; }
    emit "$1" "$2"
    ;;
esac
