#!/usr/bin/env bash
# Secret-shaped literals a change ADDS — the one source of the secret patterns,
# used by security-reviewer (Step 2) and by /pr-self-review's group E content
# trigger (routing.md § Groups).
#
#   scripts/secret-greps.sh              uncommitted change: working tree vs HEAD
#   scripts/secret-greps.sh <base> <head> a commit range
#   scripts/secret-greps.sh --self-test   prove every pattern on planted samples
#
# Method: fitness-greps.sh's subtraction — each pattern runs with `git grep -o`
# at both revisions and the hits are compared as a multiset of (file, match),
# never by line number. Hits that exist on both sides cancel, so the repo's
# known benign matches (the dev default `devdigest:devdigest` Postgres URL, UI
# objects with a `key` field, the `sk-CANARY-1` test sentinel) need no
# baseline table. A new hit is printed with its match MASKED to 4 characters:
# read the line yourself, and never print the whole match.
#
# Every pattern goes through `-e`: `-----BEGIN …` is otherwise read as an
# option, and a `| wc -l` turns that error into "0 hits" (root INSIGHTS.md
# 2026-09-28). git grep exit 1 = no match; ≥2 = a broken pattern, reported as
# ERROR — the script then exits 1 so the gap cannot pass for a clean result.
#
# Expected output at 916ddb4, `scripts/secret-greps.sh HEAD~1 HEAD`: every row
# "pass", before → after 0 → 0 except postgres-url-creds 9 → 9 and
# generic-assignment 19 → 19; "No new hits."; exit 0. `--self-test`:
# "18 passed, 0 failed"; exit 0.
# Read-only: writes nothing.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# id|ERE — POSIX classes only, no backreferences (ugrep, root INSIGHTS.md 2026-09-20).
PATTERNS=$(cat <<'EOF'
aws-access-key|AKIA[0-9A-Z]{16}
google-api-key|AIza[0-9A-Za-z_-]{35}
anthropic-key|sk-ant-[A-Za-z0-9_-]{20,}
openai-key|sk-[A-Za-z0-9]{32,}
github-token|gh[pousr]_[A-Za-z0-9]{36,}
slack-token|xox[bpsa]-[0-9a-zA-Z-]+
private-key|-----BEGIN [A-Z ]*PRIVATE KEY-----
postgres-url-creds|postgres(ql)?://[^:/[:space:]]+:[^@[:space:]]+@
generic-assignment|(secret|key|token|password)[[:space:]]*[:=][[:space:]]*["'][^"']{8,}
EOF
)

# Lock files hold integrity hashes, not secrets (and are off-limits: root AGENTS.md).
PATHSPEC=(. ':(exclude,glob)**/pnpm-lock.yaml' ':(exclude,glob)**/package-lock.json' ':(exclude)skills-lock.json')

# ---------------------------------------------------------------- self-test
# Samples are assembled at run time so this file never holds a literal that
# matches its own patterns. All of them are fake.
if [ "${1:-}" = --self-test ]; then
  x16=ABCDEFGHIJKLMNOP; x36=EXAMPLEexample0123456789EXAMPLEexampl
  pos() { case $1 in
    aws-access-key)     printf '%s' "AK""IA$x16" ;;
    google-api-key)     printf '%s' "AI""za${x36:0:35}" ;;
    anthropic-key)      printf '%s' "sk-""ant-${x36:0:24}" ;;
    openai-key)         printf '%s' "sk""-${x36:0:32}" ;;
    github-token)       printf '%s' "gh""p_$x36" ;;
    slack-token)        printf '%s' "xo""xb-0000-EXAMPLE" ;;
    private-key)        printf '%s' "-----BEGIN RSA PRI""VATE KEY-----" ;;
    postgres-url-creds) printf '%s' "postgres:/""/app:hunter2@db:5432/app" ;;
    generic-assignment) printf '%s' "token = \"ex""ample-token-value\"" ;;
  esac; }
  neg() { case $1 in
    aws-access-key)     printf '%s' "AKIA${x16:0:15}" ;;
    google-api-key)     printf '%s' "AIza${x36:0:34}" ;;
    anthropic-key)      printf '%s' "sk-ant-short" ;;
    openai-key)         printf '%s' "sk-short-value" ;;
    github-token)       printf '%s' "ghp_${x36:0:35}" ;;
    slack-token)        printf '%s' "xoxz-0000-EXAMPLE" ;;
    private-key)        printf '%s' "-----BEGIN PUBLIC KEY-----" ;;
    postgres-url-creds) printf '%s' "postgres://localhost:5432/app" ;;
    generic-assignment) printf '%s' "token = \"short\"" ;;
  esac; }
  pass=0; fail=0
  while IFS='|' read -r id pat; do
    [ -z "$id" ] && continue
    pos "$id" | grep -qE -e "$pat"; rc=$?
    if [ "$rc" -eq 0 ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $id: planted positive not matched (grep exit $rc)"; fi
    neg "$id" | grep -qE -e "$pat"; rc=$?
    if [ "$rc" -eq 1 ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL $id: planted negative matched or grep failed (exit $rc)"; fi
  done <<< "$PATTERNS"
  echo "$pass passed, $fail failed"
  [ "$fail" -eq 0 ]; exit $?
fi

# ---------------------------------------------------------------- scan
if [ $# -eq 2 ]; then
  BEFORE=$1; AFTER=$2; LABEL="$1..$2"
  STATUS=$(git diff --name-status -M "$BEFORE" "$AFTER")
elif [ $# -eq 0 ]; then
  BEFORE=HEAD; AFTER=WORKTREE; LABEL="working tree vs HEAD"
  STATUS=$( { git diff --name-status -M HEAD; git ls-files -o --exclude-standard | sed 's/^/A\t/'; } )
else
  echo "usage: scripts/secret-greps.sh [<base> <head> | --self-test]" >&2; exit 2
fi

FILE_STATUS=$(printf '%s\n' "$STATUS" | awk -F'\t' 'NF >= 2 { s = substr($1, 1, 1); p = (s == "R" || s == "C") ? $3 : $2; print p "\t" s }')

ERRORS=0

# hits <rev|WORKTREE> <pattern> → sets HITS ("file<TAB>line<TAB>match" per hit)
# and HIT_RC (git grep's exit). Called directly, not in $(…): a subshell would
# lose HIT_RC.
hits() {
  local rev=$1 pat=$2 out
  if [ "$rev" = WORKTREE ]; then
    out=$(git grep --untracked -I -n -o -E -e "$pat" -- "${PATHSPEC[@]}" 2>/dev/null); HIT_RC=$?
  else
    # strip the "<rev>:" prefix git grep puts on every hit at a revision
    out=$(git grep -I -n -o -E -e "$pat" "$rev" -- "${PATHSPEC[@]}" 2>/dev/null); HIT_RC=$?
    out=$(printf '%s\n' "$out" | awk -v n=$((${#rev} + 1)) 'NF { print substr($0, n + 1) }')
  fi
  # path:line:match — the match itself may contain ':' (a URL)
  HITS=$(printf '%s\n' "$out" | awk 'NF { i = index($0, ":"); f = substr($0, 1, i - 1); r = substr($0, i + 1); j = index(r, ":"); print f "\t" substr(r, 1, j - 1) "\t" substr(r, j + 1) }')
}

echo "secret-greps · $LABEL"
printf '%-20s %-10s %s\n' "pattern" "result" "before → after"
REPORT=""
while IFS='|' read -r id pat; do
  [ -z "$id" ] && continue
  hits "$BEFORE" "$pat"; before=$HITS; rc_b=$HIT_RC
  hits "$AFTER" "$pat";  after=$HITS;  rc_a=$HIT_RC
  if [ "$rc_b" -gt 1 ] || [ "$rc_a" -gt 1 ]; then
    ERRORS=$((ERRORS + 1))
    printf '%-20s %-10s git grep exit %s / %s — pattern did not run\n' "$id" ERROR "$rc_b" "$rc_a"
    continue
  fi
  new=$(awk -F'\t' 'NR == FNR { if (NF) c[$1 FS $3]++; next } NF { k = $1 FS $3; if (c[k] > 0) c[k]--; else print }' \
          <(printf '%s\n' "$before") <(printf '%s\n' "$after"))
  nb=$(printf '%s\n' "$before" | awk 'NF' | wc -l | tr -d ' ')
  na=$(printf '%s\n' "$after" | awk 'NF' | wc -l | tr -d ' ')
  nn=$(printf '%s\n' "$new" | awk 'NF' | wc -l | tr -d ' ')
  verdict=pass; [ "$nn" -gt 0 ] && verdict=new-hit
  printf '%-20s %-10s %4s → %-4s new %s\n' "$id" "$verdict" "$nb" "$na" "$nn"
  if [ "$nn" -gt 0 ]; then
    REPORT+=$(printf '%s\n' "$new" | FS_DATA="$FILE_STATUS" awk -F'\t' -v id="$id" '
      BEGIN { n = split(ENVIRON["FS_DATA"], rows, "\n"); for (i = 1; i <= n; i++) { split(rows[i], kv, "\t"); st[kv[1]] = kv[2] } }
      NF {
        s = ($1 in st) ? st[$1] "-file" : "not in the diff"
        printf "  %s  %s\n      %s:%s  %s… (%d chars)\n", id, s, $1, $2, substr($3, 1, 4), length($3)
      }')$'\n'
  fi
done <<< "$PATTERNS"

echo
if [ -n "$REPORT" ]; then
  echo "New hits — matches are masked; read each line yourself and never print a match whole:"
  printf '%s' "$REPORT"
else
  echo "No new hits."
fi
if [ "$ERRORS" -gt 0 ]; then
  echo "INCOMPLETE: $ERRORS pattern(s) did not run — this is not a clean result."
  exit 1
fi
exit 0
