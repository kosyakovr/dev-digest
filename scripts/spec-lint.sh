#!/usr/bin/env bash
# spec-lint.sh — deterministic checks on a spec written from specs/_template.md.
#
#   scripts/spec-lint.sh <spec.md>...
#
# Prints one line per problem:  <file>:<line>: <check>: <detail>
#   vague       an AC or NFR uses a word with no observable meaning (fast, properly, …)
#   untraced    an AC or NFR has no row in § Traceability and verification
#   orphan-row  a Traceability row names an AC or NFR the spec does not define
#   no-ac       a user story that no AC or NFR cites
#   uncited     a source S-n that nothing cites
#   markers     more than 3 [NEEDS CLARIFICATION] questions under § Open questions
# An AC or NFR marked `withdrawn` is exempt from vague / untraced.
# Skipped with a note on stderr, and passing: README.md and _template.md, and a
# file with no "## Traceability and verification" heading (L01–L04 predate it).
#
# Used by: spec-creator Step 7, implementation-planner Step 0, pr-self-review § 3.
# Exit: 0 clean, 1 problems found, 2 usage error or unreadable file.
# Test: scripts/test-spec-lint.sh
#
# Expected on this repo (2026-10-03): `scripts/spec-lint.sh specs/*.md` prints
# only "skipped" notes (README, _template and the seven L01–L04 specs) and exits 0.

set -u

VAGUE='fast|quick|quickly|intuitive|properly|gracefully|user-friendly|robust|seamless|appropriate|appropriately|reasonable|as needed|etc'
DEF='^- \*\*(AC|NFR)-[0-9]+\*\*'

[ $# -gt 0 ] || { echo "usage: spec-lint.sh <spec.md>..." >&2; exit 2; }

status=0
for f in "$@"; do
  [ -r "$f" ] || { echo "$f: unreadable" >&2; exit 2; }
  case "$(basename "$f")" in
    README.md|_template.md) echo "$f: skipped (not a spec)" >&2; continue ;;
  esac
  grep -q '^## Traceability and verification' "$f" || {
    echo "$f: skipped (no § Traceability and verification — written before the template)" >&2
    continue
  }

  out=$(
    # vague
    grep -n -E "$DEF" "$f" | grep -v -w withdrawn | grep -i -w -E "$VAGUE" |
      while IFS=: read -r n line; do
        echo "$f:$n: vague: $(printf '%s' "$line" | grep -o -i -w -E "$VAGUE" | head -1)"
      done

    defined=$(grep -E "$DEF" "$f" | grep -v -w withdrawn | grep -oE '^- \*\*(AC|NFR)-[0-9]+' | grep -oE '(AC|NFR)-[0-9]+' | sort -u)
    all_defined=$(grep -oE "$DEF" "$f" | grep -oE '(AC|NFR)-[0-9]+' | sort -u)
    rows=$(grep -oE '^\| (AC|NFR)-[0-9]+ ' "$f" | grep -oE '(AC|NFR)-[0-9]+' | sort -u)

    # untraced
    for id in $(comm -23 <(printf '%s\n' "$defined") <(printf '%s\n' "$rows")); do
      echo "$f:$(grep -n -E "^- \*\*$id\*\*" "$f" | head -1 | cut -d: -f1): untraced: $id has no Traceability row"
    done
    # orphan-row
    for id in $(comm -13 <(printf '%s\n' "$all_defined") <(printf '%s\n' "$rows")); do
      echo "$f:$(grep -n -E "^\| $id " "$f" | head -1 | cut -d: -f1): orphan-row: $id is not defined"
    done
    # no-ac
    cited=$(grep -oE "$DEF \(US-[0-9]+" "$f" | grep -oE 'US-[0-9]+' | sort -u)
    for us in $(comm -23 <(grep -oE '^### US-[0-9]+' "$f" | grep -oE 'US-[0-9]+' | sort -u) <(printf '%s\n' "$cited")); do
      echo "$f:$(grep -n -E "^### $us( |$)" "$f" | head -1 | cut -d: -f1): no-ac: $us has no AC or NFR"
    done
    # uncited
    for s in $(grep -oE '^\| S-[0-9]+ ' "$f" | grep -oE 'S-[0-9]+'); do
      [ "$(grep -c -w -- "$s" "$f")" -gt 1 ] ||
        echo "$f:$(grep -n -E "^\| $s " "$f" | head -1 | cut -d: -f1): uncited: $s is never cited"
    done
    # markers
    m=$(awk '/^## /{on=($0 ~ /^## Open questions/)} on && /^- \[NEEDS CLARIFICATION/' "$f" | wc -l | tr -d ' ')
    [ "$m" -le 3 ] || echo "$f:$(grep -n '^## Open questions' "$f" | head -1 | cut -d: -f1): markers: $m open questions (at most 3)"
  )

  if [ -n "$out" ]; then
    printf '%s\n' "$out"
    status=1
  fi
done
exit $status
