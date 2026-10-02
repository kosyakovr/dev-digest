#!/usr/bin/env bash
# review-greps.sh — the deterministic checks both reviewers need, ONE source of truth.
#
#   review-greps.sh [base [head]]   new hits only, classed per greps.md § Scoping a new hit
#   review-greps.sh --self-test     assert every parsed pattern matches its `sample`
#
# It hard-codes NO pattern. It PARSES:
#   * .claude/skills/pr-self-review/greps.md § The patterns   (id | pattern | pathspec | both revs | sample)
#       (files-with-match) / (files-without-match) rows change the mode (-l / -L); the
#       `fe-15-junk-drawer` row is a path check whose regex is read from the
#       `git ls-tree ... | grep -E '<re>'` line under the tables; a table heading
#       "run when <prefix>** is in the diff" gates the rows under it.
#   * .claude/agents/security-reviewer.md Step 2             (| Name | Pattern | sample |)
#   In a markdown cell a literal pipe is `\|`; it is unescaped here. In a `sample`, the
#   character ¦ is removed before testing (it keeps the sample from matching itself).
# Also runs the vendored-twin check (routing.md) and the module registration check
# (server/AGENTS.md).
#
# Method (greps.md): every pattern at BOTH revisions with `git grep -nE`, subtracted by
# (file, whitespace-normalised match) — never by line number. Default base = HEAD,
# default head = the working tree incl. untracked, via `change-set.sh --snapshot`.
# Output, tab separated: CLASS<TAB>id<TAB>path:line<TAB>match
#   CLASS = WARNING (A file) | SUGGESTION (M/R file, or test/fixture) | drift (file not in the
#   diff) | CRITICAL (twin check). Secret matches are masked to 4 characters.
#   onion-13-tenancy-guard on an A file may be CRITICAL: read the hit (greps.md).
# Failure: a `git grep` exit >= 2 prints `ERROR <id>` and the script exits 2 — never silent.
# Exit: 0 no new hits | 1 new hits | 2 error. `drift` hits are printed but do not set exit 1:
#   greps.md § Scoping a new hit — drift is "recorded, never blocks".
#   (--self-test: 0 all samples match | 1 a sample failed | 2 parse error.)
#
# Bash 3.2 compatible (no assoc arrays, no mapfile). `git grep -E` has no \s: use [[:space:]].
#
# Expected on this repo (run 2026-10-01, Intent Layer work uncommitted, base HEAD):
#   --self-test   21 "ok" lines (11 greps.md rows + 10 secret rows), then
#                 "self-test: 21 passed, 0 failed", exit 0. A `\s` in any pattern, or an
#                 empty sample, makes it print FAIL <id> and exit 1.
#   default run   exactly one hit, a known benign self-reference (the security-reviewer.md
#                 table row quotes the private-key pattern, which matches itself; it
#                 disappears once that table is in HEAD), then the summary, exit 1:
#                   SUGGESTION<TAB>private-key<TAB>.claude/agents/security-reviewer.md:<n><TAB>----…
#                   review-greps: 1 new hit(s); 21 checks run, 0 skipped ...; twins checked 8; new modules checked 1; ...
#                 No `ERROR` line and no CRITICAL twin line on a healthy tree. A planted
#                 untracked file with an AWS-shaped key gave a WARNING aws-key hit, masked `AKIA…`.

set -u
set -f   # pathspecs hold * and are word-split on purpose; never glob them

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "review-greps.sh: not in a git repo" >&2; exit 2; }
cd "$root" || exit 2
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GREPS_MD=${REVIEW_GREPS_MD:-.claude/skills/pr-self-review/greps.md}   # override only for testing the error path
SEC_MD=".claude/agents/security-reviewer.md"
US=$(printf '\037')
TAB=$(printf '\t')

T=$(mktemp -d "${TMPDIR:-/tmp}/review-greps.XXXXXX") || exit 2
trap 'rm -rf "$T"' EXIT

# ---------------------------------------------------------------- parsing
# Emits one record per row, fields separated by US:
#   kind(G|S) id mode(n|L|l|P) pattern pathspecs(space-joined) sample trigger-prefix
parse_greps() {
  awk -v US="$US" '
    function strip(s) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", s); return s }
    function bts(cell, out,   n, i, j, rest) {   # backtick groups of a cell
      n = 0; rest = cell
      while ((i = index(rest, "`")) > 0) {
        rest = substr(rest, i + 1)
        j = index(rest, "`")
        if (j == 0) break
        n++; out[n] = substr(rest, 1, j - 1)
        rest = substr(rest, j + 1)
      }
      return n
    }
    /^### / {
      trig = ""
      if (match($0, /run when .* is in the diff/)) {
        t = substr($0, RSTART + 9, RLENGTH - 9 - 15)
        gsub(/`/, "", t); sub(/\*\*$/, "", t); trig = strip(t)
      }
      intable = 0; next
    }
    /^\| id \| pattern \| pathspec/ { intable = 1; next }
    /^\|---/ { next }
    intable && /^\| `/ {
      line = $0
      gsub(/\\[|]/, "\001", line)
      m = split(line, c, "|")
      id = strip(c[2]); gsub(/`/, "", id)
      pcell = c[3]; pathcell = c[4]; scell = c[6]
      nb = bts(pcell, pb)
      mode = "n"
      if (pcell ~ /files-without-match/) mode = "L"
      else if (pcell ~ /files-with-match/) mode = "l"
      else if (pcell ~ /path check/) mode = "P"
      pat = (nb >= 1) ? pb[1] : ""
      np = bts(pathcell, pp); ps = ""
      for (k = 1; k <= np; k++) ps = ps (k > 1 ? " " : "") pp[k]
      ns = bts(scell, sb); smp = (ns >= 1) ? sb[1] : ""
      gsub(/\001/, "|", pat); gsub(/\001/, "|", smp)
      nrow++; rid[nrow] = id; rmode[nrow] = mode; rpat[nrow] = pat; rps[nrow] = ps; rsmp[nrow] = smp; rtrig[nrow] = trig
      next
    }
    /git ls-tree .*grep -E / {
      s = $0; i = index(s, "grep -E \x27")
      if (i > 0) { s = substr(s, i + 9); j = 0
        for (k = length(s); k > 0; k--) if (substr(s, k, 1) == "\x27") { j = k; break }
        if (j > 0) pathpat = substr(s, 1, j - 1) }
    }
    END {
      for (i = 1; i <= nrow; i++) {
        p = rpat[i]; if (rmode[i] == "P") p = pathpat
        printf "G%s%s%s%s%s%s%s%s%s%s%s%s\n", US, rid[i], US, rmode[i], US, p, US, rps[i], US, rsmp[i], US, rtrig[i]
      }
    }
  ' "$GREPS_MD"
}

parse_secrets() {
  awk -v US="$US" '
    function strip(s) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", s); return s }
    function bt(cell,   i, j, rest) {
      rest = cell; i = index(rest, "`"); if (i == 0) return ""
      rest = substr(rest, i + 1); j = index(rest, "`"); if (j == 0) return ""
      return substr(rest, 1, j - 1)
    }
    /^[[:space:]]*\| Name \| Pattern \|/ { intable = 1; next }
    intable && /^[[:space:]]*\|---/ { next }
    intable && /^[[:space:]]*\|/ {
      line = $0; gsub(/\\[|]/, "\001", line)
      split(line, c, "|")
      id = strip(c[2]); pat = bt(c[3]); smp = bt(c[4])
      gsub(/\001/, "|", pat); gsub(/\001/, "|", smp)
      print "S" US id US "n" US pat US "" US smp US
      next
    }
    intable { intable = 0 }
  ' "$SEC_MD"
}

# ---------------------------------------------------------------- self-test
self_test() {
  local rows pass=0 fail=0 d kind id mode pat paths smp trig s
  rows="$T/rows"
  { parse_greps; parse_secrets; } >"$rows"
  [ -s "$rows" ] || { echo "self-test: parsed no rows from $GREPS_MD / $SEC_MD" >&2; return 2; }
  d=$(mktemp -d "$T/st.XXXXXX")
  while IFS=$US read -r kind id mode pat paths smp trig; do
    s=$(printf '%s' "$smp" | sed 's/¦//g')
    if [ -z "$pat" ] || [ -z "$s" ]; then
      echo "FAIL $id: empty pattern or sample (every row needs a sample)"; fail=$((fail + 1)); continue
    fi
    if [ "$mode" = P ]; then
      if printf '%s\n' "$s" | awk -v re="$pat" '$0 ~ re { f = 1 } END { exit f ? 0 : 1 }'; then
        echo "ok   $id (path check)"; pass=$((pass + 1))
      else echo "FAIL $id: sample '$s' does not match path regex '$pat'"; fail=$((fail + 1)); fi
      continue
    fi
    printf '%s\n' "$s" >"$d/sample.txt"
    ( cd "$d" && git grep --no-index -E -e "$pat" -- sample.txt >/dev/null 2>&1 )
    case $? in
      0) echo "ok   $id"; pass=$((pass + 1)) ;;
      1) echo "FAIL $id: sample does not match \`git grep -E\` pattern: $pat"; fail=$((fail + 1)) ;;
      *) echo "FAIL $id: git grep errored on pattern: $pat"; fail=$((fail + 1)) ;;
    esac
  done <"$rows"
  echo "self-test: $pass passed, $fail failed"
  [ "$fail" -eq 0 ]
}

if [ "${1:-}" = "--self-test" ]; then
  self_test; rc=$?
  [ "$rc" -eq 0 ] || [ "$rc" -eq 2 ] || rc=1
  exit "$rc"
fi
case "${1:-}" in -h|--help) sed -n '2,32p' "$0"; exit 0 ;; esac

# ---------------------------------------------------------------- scope
base=${1:-HEAD}
if [ $# -ge 2 ]; then head=$2; else head=$("$HERE/change-set.sh" --snapshot) || { echo "ERROR snapshot"; exit 2; }; fi
git cat-file -e "$base^{commit}" 2>/dev/null || { echo "ERROR base '$base' is not a commit"; exit 2; }
git cat-file -e "$head^{commit}" 2>/dev/null || { echo "ERROR head '$head' is not a commit"; exit 2; }
"$HERE/change-set.sh" "$base" "$head" >"$T/cs.tsv" || { echo "ERROR change-set"; exit 2; }

errors=0
REPORT="$T/report"; : >"$REPORT"
ran=0; skipped=0

# run one check at one revision -> $3 file of "path<TAB>normalised match<TAB>line"
grep_rev() { # rev mode pattern pathspecs outfile secret(0|1)
  local rev=$1 mode=$2 pat=$3 paths=$4 out=$5 secret=$6 flags raw="$T/raw" rc
  if [ "$mode" = P ]; then
    git ls-tree -r --name-only "$rev" -- $paths >"$raw" 2>"$T/err"; rc=$?
    [ "$rc" -le 1 ] || return 2
    awk -v re="$pat" '$0 ~ re { printf "%s\t\t0\n", $0 }' "$raw" >"$out"
    return 0
  fi
  case "$mode" in
    L) flags="-IL -E" ;;
    l) flags="-Il -E" ;;
    *) flags="-InE" ; [ "$secret" = 1 ] && flags="-InoE" ;;
  esac
  git grep $flags -e "$pat" "$rev" -- $paths >"$raw" 2>"$T/err"; rc=$?
  [ "$rc" -le 1 ] || return 2
  awk -v rev="$rev" -v mode="$mode" '
    index($0, rev ":") != 1 { next }
    { p = substr($0, length(rev) + 2) }
    mode == "L" || mode == "l" { printf "%s\t\t0\n", p; next }
    {
      i = index(p, ":"); path = substr(p, 1, i - 1); r = substr(p, i + 1)
      j = index(r, ":"); line = substr(r, 1, j - 1); text = substr(r, j + 1)
      gsub(/[[:space:]]+/, " ", text); sub(/^ /, "", text); sub(/ $/, "", text)
      printf "%s\t%s\t%s\n", path, text, line
    }
  ' "$raw" >"$out"
  return 0
}

subtract() { # base.tsv head.tsv -> new hits (multiset, by path+text)
  awk -F'\t' 'FILENAME == ARGV[1] { c[$1 SUBSEP $2]++; next }
    { k = $1 SUBSEP $2; if (c[k] > 0) c[k]--; else print }' "$1" "$2"
}

classify() { # id newhits mask
  awk -F'\t' -v id="$1" -v mask="$3" '
    FILENAME == ARGV[1] { st[$2] = $1; next }
    {
      path = $1; text = $2; line = $3
      test = (path ~ /\.test\./ || path ~ /(^|\/)test\// || path ~ /(^|\/)fixtures\//)
      if (!(path in st)) cls = "drift"
      else if (test) cls = "SUGGESTION"
      else if (st[path] == "A") cls = "WARNING"
      else cls = "SUGGESTION"
      if (mask == "1") text = substr(text, 1, 4) "…"
      else if (length(text) > 110) text = substr(text, 1, 110) "..."
      loc = path; if (line + 0 > 0) loc = path ":" line
      printf "%s\t%s\t%s\t%s\n", cls, id, loc, text
    }
  ' "$T/cs.tsv" "$2" >>"$REPORT"
}

in_diff() { # prefix -> 0 if any changed path starts with it
  awk -F'\t' -v p="$1" 'index($2, p) == 1 { f = 1 } END { exit f ? 0 : 1 }' "$T/cs.tsv"
}

{ parse_greps; parse_secrets; } >"$T/rows"
[ -s "$T/rows" ] || { echo "ERROR parse (no rows in $GREPS_MD / $SEC_MD)"; exit 2; }

while IFS=$US read -r kind id mode pat paths smp trig; do
  if [ -z "$pat" ]; then echo "ERROR $id (empty pattern parsed)"; errors=$((errors + 1)); continue; fi
  if [ -n "$trig" ] && ! in_diff "$trig"; then skipped=$((skipped + 1)); continue; fi
  secret=0; [ "$kind" = S ] && secret=1
  grep_rev "$base" "$mode" "$pat" "$paths" "$T/b.tsv" "$secret"; r1=$?
  grep_rev "$head" "$mode" "$pat" "$paths" "$T/h.tsv" "$secret"; r2=$?
  if [ "$r1" -ne 0 ] || [ "$r2" -ne 0 ]; then
    echo "ERROR $id (git grep exit >= 2: $(head -c 200 "$T/err" | tr '\n' ' '))"; errors=$((errors + 1)); continue
  fi
  ran=$((ran + 1))
  subtract "$T/b.tsv" "$T/h.tsv" >"$T/new.tsv"
  [ -s "$T/new.tsv" ] && classify "$id" "$T/new.tsv" "$secret"
done <"$T/rows"

# ---------------------------------------------------------------- vendored twin check
diff_pm() { git -c core.quotepath=off diff -U0 "$base" "$head" -- "$1" | awk '/^(\+\+\+|---) /{next} /^[-+]/{print}'; }
twin_checked=0
while IFS="$TAB" read -r st path rng; do
  case "$path" in
    server/src/vendor/shared/*) twin="client/src/vendor/shared/${path#server/src/vendor/shared/}" ;;
    client/src/vendor/shared/*) twin="server/src/vendor/shared/${path#client/src/vendor/shared/}" ;;
    *) continue ;;
  esac
  twin_checked=$((twin_checked + 1))
  if ! awk -F'\t' -v p="$twin" '$2 == p { f = 1 } END { exit f ? 0 : 1 }' "$T/cs.tsv"; then
    printf 'CRITICAL\ttwin\t%s\t%s\n' "$path" "vendored twin $twin was not changed (routing.md § Vendored-contract twin check)" >>"$REPORT"
  else
    diff_pm "$path" >"$T/tw1"; diff_pm "$twin" >"$T/tw2"
    cmp -s "$T/tw1" "$T/tw2" || printf 'CRITICAL\ttwin\t%s\t%s\n' "$path" "+/- lines differ from twin $twin" >>"$REPORT"
  fi
done <"$T/cs.tsv"

# ---------------------------------------------------------------- module registration
reg_checked=0
awk -F'\t' '$1 == "A" && $2 ~ /^server\/src\/modules\/[^\/]+\// { split($2, p, "/"); print p[4] }' "$T/cs.tsv" | sort -u >"$T/mods"
while read -r name; do
  [ -n "$name" ] || continue
  [ -z "$(git ls-tree "$base" -- "server/src/modules/$name" 2>/dev/null)" ] || continue   # not a new module
  git cat-file -e "$head:server/src/modules/$name/routes.ts" 2>/dev/null || continue       # no routes: nothing to register
  reg_checked=$((reg_checked + 1))
  git grep -qF "./$name/" "$head" -- server/src/modules/index.ts || \
    printf 'WARNING\tmodule-registration\tserver/src/modules/%s/\t%s\n' "$name" "new module with routes.ts is not registered in server/src/modules/index.ts" >>"$REPORT"
done <"$T/mods"

# ---------------------------------------------------------------- report
hits=$(wc -l <"$REPORT" | tr -d ' ')
drift=$(awk -F'\t' '$1 == "drift"' "$REPORT" | wc -l | tr -d ' ')
[ "$hits" -eq 0 ] || sort -t"$TAB" -k1,1 -k2,2 -k3,3 "$REPORT"
printf 'review-greps: %s new hit(s) (%s drift, non-blocking); %s checks run, %s skipped (trigger path not in diff); twins checked %s; new modules checked %s; base=%s head=%s\n' \
  "$hits" "$drift" "$ran" "$skipped" "$twin_checked" "$reg_checked" "$base" "$head"
[ "$errors" -eq 0 ] || exit 2
[ "$((hits - drift))" -eq 0 ] || exit 1
exit 0
