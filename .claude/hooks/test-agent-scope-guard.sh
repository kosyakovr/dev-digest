#!/usr/bin/env bash
# Offline test for the agent scope guard hook. No model, no network, no API key.
#
#   .claude/hooks/test-agent-scope-guard.sh
#
# Every case asserts on the decision the hook prints (deny | ask | allow = nothing)
# and on exit 0, which together are the whole contract Claude Code sees. Each case
# runs twice: with jq, and with GUARD_NO_JQ=1 to exercise the sed fallback.

set -u

HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GUARD="$HOOK_DIR/agent-scope-guard.sh"
ROOT="/repo"
export CLAUDE_PROJECT_DIR="$ROOT"
RP="/tmp/devdigest-redproof-1"   # a red-proof worktree path
PASS=0
FAIL=0

decision_of() { # stdout of the hook -> deny | ask | allow | garbage
  case "$1" in
    "") echo allow ;;
    *'"permissionDecision":"deny"'*) echo deny ;;
    *'"permissionDecision":"ask"'*) echo ask ;;
    *) echo "garbage:$1" ;;
  esac
}

run_case() { # profile, expected, name, json
  local profile=$1 expected=$2 name=$3 json=$4 mode out rc got
  for mode in jq sed; do
    if [ "$mode" = sed ]; then
      out=$(printf '%s' "$json" | GUARD_NO_JQ=1 "$GUARD" $profile); rc=$?
    else
      out=$(printf '%s' "$json" | "$GUARD" $profile); rc=$?
    fi
    got=$(decision_of "$out")
    if [ "$rc" -eq 0 ] && [ "$got" = "$expected" ]; then
      PASS=$((PASS + 1))
    else
      FAIL=$((FAIL + 1))
      printf 'FAIL [%s/%s] %s: expected %s, got %s (exit %s)\n' "$profile" "$mode" "$name" "$expected" "$got" "$rc"
    fi
  done
}

edit()  { printf '{"tool_name":"%s","tool_input":{"file_path":"%s","old_string":"a","new_string":"%s"}}' "$1" "$2" "${3:-b}"; }
bash_() { printf '{"tool_name":"Bash","tool_input":{"command":"%s","description":"x"}}' "$1"; }
tw()  { run_case test-writer "$@"; }
dw()  { run_case doc-writer  "$@"; }
sc()  { run_case spec-creator "$@"; }
ro()  { run_case read-only   "$@"; }

# ================================================================ test-writer
# ---- Edit / Write: allowed
tw allow "server unit test"            "$(edit Write "$ROOT/server/test/x.test.ts")"
tw allow "server it test with pg"      "$(edit Write "$ROOT/server/test/x.it.test.ts" "import { startPg } from './helpers/pg.js'")"
tw allow "server fixture"              "$(edit Write "$ROOT/server/test/fixtures/a.json")"
tw allow "client colocated test"       "$(edit Write "$ROOT/client/src/app/a/_components/B/B.test.tsx")"
tw allow "client lib test"             "$(edit Edit  "$ROOT/client/src/lib/format.test.ts")"
tw allow "reviewer-core test"          "$(edit Write "$ROOT/reviewer-core/test/y.test.ts")"
tw allow "mcp-server test"             "$(edit Write "$ROOT/mcp-server/test/z.test.ts")"
tw allow "mcp-server test fake"        "$(edit Write "$ROOT/mcp-server/test/fakes.ts")"
tw allow "e2e flow"                    "$(edit Write "$ROOT/e2e/specs/09-x.flow.json")"
tw allow "red-proof worktree file"     "$(edit Edit  "$RP/server/src/modules/reviews/service.ts")"
# ---- Edit / Write: ask
tw ask   "pg helper"                   "$(edit Edit  "$ROOT/server/test/helpers/pg.ts")"
tw ask   "client test setup"           "$(edit Edit  "$ROOT/client/src/test/setup.ts")"
tw ask   "mocks.ts"                    "$(edit Edit  "$ROOT/server/src/adapters/mocks.ts")"
# ---- Edit / Write: denied
tw deny  "dot-dot escape"              "$(edit Write "$ROOT/server/test/../src/a.ts")"
tw deny  "unit test importing pg"      "$(edit Write "$ROOT/server/test/a.test.ts" "import { startPg } from './helpers/pg.js'")"
tw deny  "server service"              "$(edit Edit  "$ROOT/server/src/modules/reviews/service.ts")"
tw deny  "client api"                  "$(edit Edit  "$ROOT/client/src/lib/api.ts")"
tw deny  "client component"            "$(edit Edit  "$ROOT/client/src/app/a/_components/B/B.tsx")"
tw deny  "client package.json"         "$(edit Edit  "$ROOT/client/package.json")"
tw deny  "vitest config"               "$(edit Edit  "$ROOT/client/vitest.config.ts")"
tw deny  "tsconfig"                    "$(edit Edit  "$ROOT/server/tsconfig.json")"
tw deny  "lock file"                   "$(edit Edit  "$ROOT/server/pnpm-lock.yaml")"
tw deny  "migration"                   "$(edit Write "$ROOT/server/src/db/migrations/0013_x.sql")"
tw deny  "agent definition"            "$(edit Edit  "$ROOT/.claude/agents/test-writer.md")"
tw deny  "INSIGHTS.md"                 "$(edit Edit  "$ROOT/INSIGHTS.md")"
tw deny  "vendored contract test"      "$(edit Write "$ROOT/client/src/vendor/shared/contracts/x.test.ts")"
tw deny  "e2e runner"                  "$(edit Edit  "$ROOT/e2e/run.ts")"
tw deny  "docs"                        "$(edit Edit  "$ROOT/docs/x.md")"
tw deny  "outside the project"         "$(edit Write "/etc/x")"
tw deny  "tmp without marker"          "$(edit Write "/tmp/x/server/src/a.ts")"
# ---- Bash: allowed
tw allow "server unit tests"           "$(bash_ "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'")"
tw allow "client tests"                "$(bash_ 'cd client && pnpm test 2>&1 | tail -20')"
tw allow "frozen install"              "$(bash_ 'cd server && pnpm install --frozen-lockfile')"
tw allow "worktree add with marker"    "$(bash_ "git worktree add --detach $RP HEAD")"
tw allow "copy test into worktree"     "$(bash_ "cp server/test/a.test.ts $RP/server/test/")"
tw allow "symlink node_modules"        "$(bash_ "ln -s \$PWD/server/node_modules $RP/server/node_modules")"
tw allow "mutate in worktree"          "$(bash_ "sed -i '' 's/>= 0/> 0/' $RP/server/src/a.ts")"
tw allow "run in worktree"             "$(bash_ "cd $RP/server && pnpm exec vitest run test/a.test.ts")"
tw allow "worktree remove with marker" "$(bash_ "git worktree remove --force $RP")"
tw allow "worktree prune"              "$(bash_ 'git worktree prune')"
tw allow "git status/diff"             "$(bash_ 'git status --short && git diff --stat')"
tw allow "checks script"                "$(bash_ 'scripts/checks.sh --force')"
# ---- Bash: denied
tw deny  "git commit"                  "$(bash_ 'git commit -m wip')"
tw deny  "git checkout file"           "$(bash_ 'git checkout -- src/a.ts')"
tw deny  "git stash"                   "$(bash_ 'git stash')"
tw deny  "pnpm add msw"                "$(bash_ 'cd client && pnpm add -D msw')"
tw deny  "plain install"               "$(bash_ 'pnpm install')"
tw deny  "vitest -u"                   "$(bash_ 'pnpm exec vitest run -u')"
tw deny  "pnpm test -- --update"       "$(bash_ 'pnpm test -- --update')"
tw deny  "sed -i production"           "$(bash_ 'sed -i s/a/b/ server/src/a.ts')"
tw deny  "redirect into production"    "$(bash_ 'echo x > client/src/a.ts')"
tw deny  "worktree add without marker" "$(bash_ 'git worktree add /tmp/x HEAD')"
tw deny  "npx -y"                      "$(bash_ 'npx -y stryker run')"
tw deny  "node -e"                     "$(bash_ "node -e 'require(1)'")"
tw deny  "db:migrate"                  "$(bash_ 'pnpm db:migrate')"
tw deny  "quoted db:generate"          "$(bash_ "pnpm 'db:generate'")"
# Quoted text is data, not a command (2026-09-26 self-review, generic-1-2).
tw allow "quoted test name with up"    "$(bash_ "cd server && pnpm exec vitest run test/x.test.ts -t 'rolls up costs'")"
tw deny  "unquoted pnpm up still"      "$(bash_ 'pnpm up zod')"

# ================================================================ doc-writer
# ---- Edit / Write: allowed
dw allow "root docs"                   "$(edit Write "$ROOT/docs/x.md")"
dw allow "agent-prompts README"        "$(edit Edit  "$ROOT/docs/agent-prompts/README.md")"
dw allow "package docs"                "$(edit Write "$ROOT/server/docs/review-flow.md")"
dw allow "package ADR"                 "$(edit Write "$ROOT/server/docs/adr/0001-x.md")"
dw allow "client README"               "$(edit Edit  "$ROOT/client/README.md")"
dw allow "root README"                 "$(edit Edit  "$ROOT/README.md")"
dw allow "module README"               "$(edit Write "$ROOT/server/src/modules/repo-intel/README.md")"
dw allow "TESTING.md"                  "$(edit Edit  "$ROOT/TESTING.md")"
# ---- Edit / Write: ask
dw ask   "root AGENTS.md"              "$(edit Edit  "$ROOT/AGENTS.md")"
dw ask   "package AGENTS.md"           "$(edit Edit  "$ROOT/server/AGENTS.md")"
dw ask   "spec"                        "$(edit Edit  "$ROOT/server/specs/L03-x.md")"
dw ask   "reviewer prompt"             "$(edit Edit  "$ROOT/docs/agent-prompts/general-reviewer.md")"
# ---- Edit / Write: denied
dw deny  "root INSIGHTS.md"            "$(edit Edit  "$ROOT/INSIGHTS.md")"
dw deny  "client INSIGHTS.md"          "$(edit Edit  "$ROOT/client/INSIGHTS.md")"
dw deny  "agents README"               "$(edit Edit  "$ROOT/.claude/agents/README.md")"
dw deny  "vendored ui README"          "$(edit Edit  "$ROOT/client/src/vendor/ui/README.md")"
dw deny  "png diagram"                 "$(edit Write "$ROOT/docs/diagram.png")"
dw deny  "source file"                 "$(edit Edit  "$ROOT/server/src/a.ts")"
dw deny  "test file"                   "$(edit Edit  "$ROOT/server/test/a.test.ts")"
dw deny  "CLAUDE.md"                   "$(edit Write "$ROOT/CLAUDE.md")"
dw deny  "red-proof path"              "$(edit Write "$RP/docs/x.md")"
# ---- Bash
dw allow "read and grep"               "$(bash_ "git log -5 --oneline && grep -rn 'register' server/src/modules/index.ts")"
dw allow "ls links"                    "$(bash_ 'ls server/docs docs 2>/dev/null')"
dw deny  "redirect a doc"              "$(bash_ 'cat a.md > docs/b.md')"
dw deny  "tee a doc"                   "$(bash_ 'echo x | tee docs/b.md')"
dw deny  "git add"                     "$(bash_ 'git add docs/b.md')"
dw deny  "mermaid-cli via npx"         "$(bash_ 'npx -y @mermaid-js/mermaid-cli -i a.mmd -o a.svg')"
dw deny  "worktree add"                "$(bash_ "git worktree add --detach $RP HEAD")"
# An apostrophe inside double quotes must not open a '...' span that hides the
# write after it (2026-09-26 self-review, generic-1-1). Heredoc: both quote kinds.
APOS_SED=$(cat <<'JSON'
{"tool_name":"Bash","tool_input":{"command":"grep -n \"isn't\" docs/a.md && sed -i '' 's/a/b/' docs/a.md","description":"x"}}
JSON
)
dw deny  "apostrophe then sed -i"      "$APOS_SED"

# ================================================================ spec-creator
# ---- Edit / Write: allowed (new files - nothing exists under /repo)
sc allow "new cross-package spec"      "$(edit Write "$ROOT/docs/specs/L05-x.md" '**Status:** draft')"
sc allow "new server spec"             "$(edit Write "$ROOT/server/specs/L05-x.md")"
sc allow "new client spec"             "$(edit Write "$ROOT/client/specs/L05-x.md")"
sc allow "new reviewer-core spec"      "$(edit Write "$ROOT/reviewer-core/specs/L05-x.md")"
sc allow "new mcp-server spec"         "$(edit Write "$ROOT/mcp-server/specs/L05-x.md")"
sc allow "relative path"               "$(edit Write "docs/specs/L05-rel.md")"
sc allow "template status line"        "$(edit Write "$ROOT/docs/specs/L05-y.md" '**Status:** draft | in-progress | done')"
# ---- existing specs: a draft is editable, anything else asks
SC_DIR=$(mktemp -d "${TMPDIR:-/tmp}/devdigest-spec-guard.XXXXXX")
trap 'rm -rf "$SC_DIR"' EXIT
mkdir -p "$SC_DIR/docs/specs" "$SC_DIR/server/specs" "$SC_DIR/client/specs"
printf '# A\n\n**Status:** draft\n' > "$SC_DIR/docs/specs/L05-draft.md"
printf '# B\n\n**Status:** done\n'  > "$SC_DIR/server/specs/L03-done.md"
printf '# C\n\nno status line\n'    > "$SC_DIR/client/specs/L04-old.md"
export CLAUDE_PROJECT_DIR="$SC_DIR"
sc allow "edit own draft"              "$(edit Edit  "$SC_DIR/docs/specs/L05-draft.md")"
sc ask   "edit a done spec"            "$(edit Edit  "$SC_DIR/server/specs/L03-done.md")"
sc ask   "overwrite a done spec"       "$(edit Write "$SC_DIR/server/specs/L03-done.md" '**Status:** draft')"
sc ask   "edit a spec with no status"  "$(edit Edit  "$SC_DIR/client/specs/L04-old.md")"
export CLAUDE_PROJECT_DIR="$ROOT"
# ---- Edit / Write: ask
sc ask   "draft promoted to done"      "$(edit Edit  "$ROOT/docs/specs/L05-x.md" '**Status:** done')"
sc ask   "new spec in progress"        "$(edit Write "$ROOT/server/specs/L05-x.md" '**Status:** in-progress')"
# ---- Edit / Write: denied
sc deny  "specs README"                "$(edit Edit  "$ROOT/docs/specs/README.md")"
sc deny  "package template"            "$(edit Edit  "$ROOT/server/specs/_template.md")"
sc deny  "spec subfolder"              "$(edit Write "$ROOT/docs/specs/l05/x.md")"
sc deny  "non-markdown in specs"       "$(edit Write "$ROOT/docs/specs/x.json")"
sc deny  "e2e flow"                    "$(edit Write "$ROOT/e2e/specs/09-x.flow.json")"
sc deny  "e2e specs markdown"          "$(edit Write "$ROOT/e2e/specs/L05-x.md")"
sc deny  "root docs"                   "$(edit Write "$ROOT/docs/x.md")"
sc deny  "package docs"                "$(edit Write "$ROOT/server/docs/x.md")"
sc deny  "root AGENTS.md"              "$(edit Edit  "$ROOT/AGENTS.md")"
sc deny  "INSIGHTS.md"                 "$(edit Edit  "$ROOT/server/INSIGHTS.md")"
sc deny  "agent definition"            "$(edit Edit  "$ROOT/.claude/agents/spec-creator.md")"
sc deny  "source file"                 "$(edit Edit  "$ROOT/server/src/modules/blast/routes.ts")"
sc deny  "migration"                   "$(edit Write "$ROOT/server/src/db/migrations/0014_x.sql")"
sc deny  "vendored contract"           "$(edit Edit  "$ROOT/client/src/vendor/shared/contracts/a.ts")"
sc deny  "dot-dot escape"              "$(edit Write "$ROOT/docs/specs/../x.md")"
sc deny  "outside the project"         "$(edit Write "/tmp/x/docs/specs/L05-x.md")"
# ---- Bash
sc allow "history search"              "$(bash_ "git log --all --oneline -i --grep 'blast'")"
sc allow "route grep"                  "$(bash_ 'grep -rnE "app\\.(get|post)\\(" server/src/modules/')"
sc allow "branch name"                 "$(bash_ 'git branch --show-current')"
sc deny  "redirect a spec"             "$(bash_ 'cat a.md > docs/specs/L05-x.md')"
sc deny  "sed -i a spec"               "$(bash_ "sed -i '' 's/a/b/' docs/specs/L05-x.md")"
sc deny  "curl"                        "$(bash_ 'curl https://www.figma.com/file/x')"
sc deny  "git add"                     "$(bash_ 'git add docs/specs/L05-x.md')"

# ================================================================ read-only
# ---- Edit / Write: everything denied
ro deny  "edit source"                 "$(edit Edit  "$ROOT/server/src/a.ts")"
ro deny  "write test"                  "$(edit Write "$ROOT/server/test/a.test.ts")"
ro deny  "write docs"                  "$(edit Write "$ROOT/docs/x.md")"
ro deny  "write tmp"                   "$(edit Write "/tmp/x.md")"
# ---- Bash: allowed
ro allow "diff stat"                   "$(bash_ 'git diff --stat 2>&1')"
ro allow "name-status + untracked"     "$(bash_ 'git diff --name-status -M HEAD && git ls-files --others --exclude-standard')"
ro allow "git grep at a revision"      "$(bash_ "git grep -nE 'drizzle-orm' HEAD -- ':(glob)server/src/modules/*/routes.ts' >/dev/null")"
ro allow "grep a JSX tag"              "$(bash_ "grep -rn '</Modal>' client/src/app")"
ro allow "grep an arrow"               "$(bash_ "grep -rn '=> {' server/src/modules/reviews")"
ro allow "sed -n a line"               "$(bash_ "sed -n '40,45p' server/src/app.ts")"
ro allow "grep for rm"                 "$(bash_ "grep -rn 'rm -rf' scripts")"
ro allow "typecheck"                   "$(bash_ 'cd server && pnpm typecheck')"
ro allow "integration tests"           "$(bash_ 'cd server && pnpm exec vitest run .it.test')"
ro allow "reviewer-core tests"         "$(bash_ 'cd reviewer-core && npm test')"
ro allow "docker info"                 "$(bash_ 'docker info >/dev/null 2>&1 && echo up')"
ro allow "merge-base"                  "$(bash_ 'git merge-base main HEAD')"
ro allow "worktree list"               "$(bash_ 'git worktree list')"
# ---- Bash: denied
ro deny  "echo into file"              "$(bash_ 'echo a > f')"
ro deny  "append into file"            "$(bash_ 'git log >> notes.txt')"
ro deny  "diff into patch"             "$(bash_ 'git diff > p.patch')"
ro deny  "tee"                         "$(bash_ 'git diff | tee p.patch')"
ro deny  "rm"                          "$(bash_ 'rm -rf server/test')"
ro deny  "sed -i"                      "$(bash_ 'sed -i s/a/b/ server/src/a.ts')"
ro deny  "find -delete"                "$(bash_ 'find . -name x -delete')"
ro deny  "git add"                     "$(bash_ 'git add -A')"
ro deny  "git config"                  "$(bash_ 'git config user.name x')"
ro deny  "git worktree add"            "$(bash_ "git worktree add --detach $RP HEAD")"
ro deny  "git push"                    "$(bash_ 'git push origin HEAD')"
ro deny  "gh pr create"                "$(bash_ 'gh pr create --fill')"
ro deny  "npm ci"                      "$(bash_ 'cd e2e && npm ci')"
ro deny  "frozen install"              "$(bash_ 'pnpm install --frozen-lockfile')"
ro deny  "npx"                         "$(bash_ 'npx tsc --noEmit')"
ro allow "git grep for db:generate"    "$(bash_ "git grep -n 'db:generate' -- docs")"
ro allow "grep for quoted yarn"        "$(bash_ "grep -rn 'yarn' docs")"
APOS_RM=$(cat <<'JSON'
{"tool_name":"Bash","tool_input":{"command":"grep -n \"don't\" docs/a.md && rm -rf server/test && echo 'x'","description":"x"}}
JSON
)
ro deny  "apostrophe then rm"          "$APOS_RM"
ro deny  "node -e"                     "$(bash_ 'node -e 1')"
ro deny  "sh -c"                       "$(bash_ "sh -c 'echo x'")"
ro deny  "curl"                        "$(bash_ 'curl https://example.com')"
ro deny  "db:migrate"                  "$(bash_ 'pnpm db:migrate')"
ro deny  "drizzle-kit push"            "$(bash_ 'pnpm exec drizzle-kit push')"
ro deny  "quoted db:generate"          "$(bash_ "pnpm 'db:generate'")"
ro deny  "run \"db:migrate\""          '{"tool_name":"Bash","tool_input":{"command":"pnpm run \"db:migrate\"","description":"x"}}'
ro deny  "quoted drizzle-kit"          "$(bash_ "npx 'drizzle-kit' push")"
ro allow "git grep drizzle-kit push"   "$(bash_ "git grep -n 'drizzle-kit push' -- docs")"
ro deny  "backslash db:generate"       '{"tool_name":"Bash","tool_input":{"command":"pnpm db\\:generate","description":"x"}}'
ro deny  "path to drizzle-kit"         "$(bash_ "node_modules/.bin/'drizzle-kit' push")"
ro allow "grep for pnpm db:generate"   "$(bash_ "grep -rn 'pnpm db:generate' docs")"
ro allow "git log --grep pnpm db:"     "$(bash_ "git log --oneline --grep 'pnpm db:migrate'")"
# wrappers before a quoted target (round-3 self-review, E+F-1) and other launchers
ro deny  "env + quoted db:migrate"     "$(bash_ "env pnpm 'db:migrate'")"
ro deny  "time + quoted db:push"       "$(bash_ "cd server && time pnpm 'db:push'")"
ro deny  "{ } + quoted db:seed"        "$(bash_ "{ pnpm 'db:seed'; }")"
ro deny  "then + quoted db:migrate"    "$(bash_ "if true; then pnpm 'db:migrate'; fi")"
ro deny  "find -exec quoted db:gen"    "$(bash_ "find . -maxdepth 0 -exec pnpm 'db:generate' ;")"
ro deny  "ANSI-C quoted db:push"       "$(bash_ "pnpm \$'db:push'")"
ro deny  "bunx quoted drizzle-kit"     "$(bash_ "bunx 'drizzle-kit' push")"
ro deny  "node drizzle-kit bin"        "$(bash_ 'node node_modules/drizzle-kit/bin.cjs push')"
ro allow "rg drizzle-kit push"         "$(bash_ "rg -n 'drizzle-kit push' docs")"
# round-4 self-review: inspecting the package is not a run; git options / ugrep stay data
ro allow "cat drizzle-kit package"     "$(bash_ 'cat server/node_modules/drizzle-kit/package.json')"
ro allow "ls drizzle-kit package"      "$(bash_ 'ls server/node_modules/drizzle-kit/')"
ro allow "git -C x grep db:generate"   "$(bash_ "git -C server grep -n 'pnpm db:generate'")"
ro allow "git --no-pager log --grep"   "$(bash_ "git --no-pager log --oneline --grep 'pnpm db:migrate'")"
ro deny  "ugrep --filter runs cmds"    "$(bash_ "ugrep --filter='md:env pnpm db:generate' -r x docs")"
ro deny  "printf db:push |& sh"        "$(bash_ "printf 'pnpm db:push' |& sh")"
ro deny  "printf db:push | dash"       "$(bash_ "printf 'pnpm db:push' | dash")"
ro deny  "process substitution"        "$(bash_ "sh < <(echo 'pnpm db:migrate')")"
ro allow "rg -l | xargs wc"            "$(bash_ "rg -l 'db:generate' docs | xargs wc -l")"
ro allow "git grep -l | xargs grep"    "$(bash_ "git grep -l 'drizzle-kit' | xargs grep -n generate")"
ro allow "grep || bash"                "$(bash_ "grep -c 'db:generate' docs/x.md || bash scripts/x.sh")"
ro deny  "git log --format | sh"       "$(bash_ "git log -1 --format='pnpm db:generate' | sh")"
ro deny  "git show --format | xargs"   "$(bash_ "git show -s --format='db:migrate' HEAD | xargs pnpm")"
ro deny  "grep -oh | bash"             "$(bash_ "grep -oh 'pnpm db:push' server/README.md | bash")"
ro deny  "printf db:push | sh"         "$(bash_ "printf 'pnpm db:push' | sh")"
ro deny  "echo db:seed | xargs pnpm"   "$(bash_ "echo 'db:seed' | xargs pnpm")"
ro deny  "drizzle-kit introspect"      "$(bash_ "npx 'drizzle-kit' introspect")"
tw deny  "env + quoted db:generate"    "$(bash_ "env pnpm 'db:generate'")"
ro deny  "docker compose down"         "$(bash_ 'docker compose down -v')"
# ---- what brainstormer and security-reviewer depend on
ro allow "diff hunks range"            "$(bash_ 'git diff -U0 HEAD~1 HEAD')"
ro allow "greps at base"               "$(bash_ "git grep -nE 'process\\.env' HEAD")"
ro allow "greps on change"             "$(bash_ "git grep -nE --untracked 'process\\.env'")"
ro allow "secret scan on added lines"  "$(bash_ "git diff -U0 HEAD | grep -nE 'AKIA[0-9A-Z]{16}'")"
ro allow "log all grep"                "$(bash_ "git log --all --oneline -i --grep 'smart order'")"
ro allow "change-set script"           "$(bash_ 'scripts/change-set.sh')"
ro allow "change-set --since"          "$(bash_ 'scripts/change-set.sh --since abc')"
ro allow "review-greps script"         "$(bash_ 'scripts/review-greps.sh')"
ro allow "checks script (verifier)"    "$(bash_ 'scripts/checks.sh')"
ro deny  "gh api"                      "$(bash_ 'gh api repos/o/r/contents/x')"
ro deny  "wget"                        "$(bash_ 'wget https://example.com/x')"

# ================================================================ fail safe
run_case ""          ask  "missing profile"         "$(edit Edit "$ROOT/server/test/a.test.ts")"
run_case implementer ask  "unknown profile"         "$(edit Edit "$ROOT/server/test/a.test.ts")"
tw ask   "empty input"                 ''
tw ask   "Edit without file_path"      '{"tool_name":"Edit","tool_input":{}}'
ro ask   "Bash without command"        '{"tool_name":"Bash","tool_input":{}}'
ro allow "unknown tool"                '{"tool_name":"Read","tool_input":{"file_path":"/repo/server/pnpm-lock.yaml"}}'
ro deny  "escaped quotes in command"   '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"wip: x\"","description":"x"}}'
dw deny  "pretty-printed json"         $'{\n  "tool_name": "Edit",\n  "tool_input": {\n    "file_path": "/repo/INSIGHTS.md"\n  }\n}'

# Without CLAUDE_PROJECT_DIR an absolute path cannot be placed: ask, not allow.
out=$(printf '%s' "$(edit Write "$ROOT/server/test/a.test.ts")" | env -u CLAUDE_PROJECT_DIR "$GUARD" test-writer); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = ask ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [no project dir] test write: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi

# ---- Stripped environment: no PATH, no HOME — the hook must still decide.
out=$(printf '%s' "$(edit Edit "$ROOT/server/pnpm-lock.yaml")" | env -i CLAUDE_PROJECT_DIR="$ROOT" /bin/sh "$GUARD" test-writer); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i] lock file edit: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi
out=$(printf '%s' "$(bash_ 'git push')" | env -i GUARD_NO_JQ=1 /bin/sh "$GUARD" read-only); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i, sed] git push: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi
out=$(printf '%s' "$(bash_ 'echo x > docs/a.md')" | env -i /bin/sh "$GUARD" doc-writer); rc=$?
if [ "$rc" -eq 0 ] && [ "$(decision_of "$out")" = deny ]; then PASS=$((PASS + 1)); else
  FAIL=$((FAIL + 1)); printf 'FAIL [env -i] doc-writer redirect: got %s (exit %s)\n' "$(decision_of "$out")" "$rc"; fi

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
