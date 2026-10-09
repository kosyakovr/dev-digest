#!/usr/bin/env bash
# test-spec-lint.sh — offline checks for scripts/spec-lint.sh.
#
#   scripts/test-spec-lint.sh            # with the bash on PATH
#   /bin/bash scripts/test-spec-lint.sh  # also with macOS bash 3.2
#
# Every check has a planted hit that must appear and a clean case that must not
# (root INSIGHTS.md 2026-09-21: a pattern shipped without being run). Prints one
# line per failed case and "spec-lint: <n> passed, <m> failed"; exits 1 on a failure.

set -u
here=$(cd "$(dirname "$0")" && pwd)
LINT=("${BASH:-bash}" "$here/spec-lint.sh")
tmp=$(mktemp -d "${TMPDIR:-/tmp}/spec-lint-test.XXXXXX") || exit 2
trap 'rm -rf "$tmp"' EXIT
pass=0 fail=0

# case <name> <want exit> <file> [expected line ...] — stdout must equal the lines exactly
case_() {
  local name=$1 want=$2 file=$3; shift 3
  local got rc expected
  got=$("${LINT[@]}" "$file" 2>/dev/null); rc=$?
  expected=$(printf '%s\n' "$@")
  [ $# -gt 0 ] || expected=""
  if [ "$rc" = "$want" ] && [ "$got" = "$expected" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL %s: exit %s (want %s)\n--- got\n%s\n--- want\n%s\n' "$name" "$rc" "$want" "$got" "$expected"
  fi
}

clean() { cat <<'EOF'
# Feature
**Status:** draft

## Sources
| ID | Source | What it contributes |
|---|---|---|
| S-1 | request | outcome |
| S-10 | design | states |

### US-1 — first (P1)
### US-2 — second (P2)

## Acceptance criteria
- **AC-1** (US-1 · S-1) WHEN the user opens the PR page, the PR page SHALL show the card.
- **AC-2** (US-2 · S-10) IF the server returns 500, THEN the card SHALL show "Could not load".
- **AC-3** withdrawn — merged into AC-2 (user · 2026-10-03).

## Non-functional
- **NFR-1** (time budget · A-1) WHEN the call runs, the server SHALL answer within 2 s.

## Open questions
- [NEEDS CLARIFICATION: one — options: A (recommended) | B]

## Traceability and verification
| ID | Method | Suite | Verification hint |
|---|---|---|---|
| AC-1 | test | client | the card renders |
| AC-2 | test | client | the text renders |
| NFR-1 | demo | — | answer within 2 s |
EOF
}

# 1. clean spec (short traceability table, a withdrawn AC with no row, S-1 vs S-10)
clean > "$tmp/clean.md"
case_ clean 0 "$tmp/clean.md"

# 2. every check planted once
clean | sed \
  -e 's/SHALL show the card\./SHALL show the card quickly./' \
  -e '/^| NFR-1 /d' \
  -e 's/^| AC-2 | test/| AC-9 | test/' \
  -e 's/(US-2 · S-10)/(US-1 · S-1)/' \
  > "$tmp/planted.md"
case_ planted 1 "$tmp/planted.md" \
  "$tmp/planted.md:14: vague: quickly" \
  "$tmp/planted.md:15: untraced: AC-2 has no Traceability row" \
  "$tmp/planted.md:19: untraced: NFR-1 has no Traceability row" \
  "$tmp/planted.md:28: orphan-row: AC-9 is not defined" \
  "$tmp/planted.md:11: no-ac: US-2 has no AC or NFR" \
  "$tmp/planted.md:8: uncited: S-10 is never cited"

# 3. a vague word on a withdrawn line is exempt; "etc" inside a path outside an AC is not a hit
clean | sed -e 's/merged into AC-2/merged, handled properly/' -e 's#^| S-1 | request#| S-1 | request ../../etc/passwd#' > "$tmp/exempt.md"
case_ exempt 0 "$tmp/exempt.md"

# 4. four open questions
clean | awk '{print} /^- \[NEEDS CLARIFICATION: one/{for (i = 0; i < 3; i++) print "- [NEEDS CLARIFICATION: more]"}' > "$tmp/markers.md"
case_ markers 1 "$tmp/markers.md" "$tmp/markers.md:21: markers: 4 open questions (at most 3)"

# 5. skipped: a spec before the template, and the template itself
clean | sed '/^## Traceability and verification/d' > "$tmp/legacy.md"
case_ legacy 0 "$tmp/legacy.md"
mkdir -p "$tmp/t" && clean | sed 's/the card\./the card quickly./' > "$tmp/t/_template.md"
case_ template 0 "$tmp/t/_template.md"

# 6. usage errors
case_ unreadable 2 "$tmp/missing.md"
"${LINT[@]}" >/dev/null 2>&1; rc=$?
if [ "$rc" = 2 ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL no-args: exit $rc (want 2)"; fi

echo "spec-lint: $pass passed, $fail failed"
[ "$fail" = 0 ]
