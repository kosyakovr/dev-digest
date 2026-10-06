# Insights — cross-package

Findings that span more than one package, or belong to the repo itself (CI,
Docker, root scripts, the vendored `@devdigest/shared` contracts).
Anything scoped to a single package goes in that package's `INSIGHTS.md`.

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into **every** session in this repo, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

> **Consolidated 2026-09-22, -23, -24 and 2026-10-05** with the user's approval;
> no finding dropped. Prior text: `git show 7de415a:INSIGHTS.md`. This file now
> keeps only traps of the environment and the agent workflow that every session
> needs; each moved entry is stated in full at its destination:
> - LLM `maxTokens` and hidden reasoning → [reviewer-core/docs/llm-token-budget.md](reviewer-core/docs/llm-token-budget.md)
> - `pr_files` written only by `GET /pulls/:id` → [server/docs/pull-files.md](server/docs/pull-files.md)
> - shared contracts with no route, `SUM(cost_usd)` vs null → [docs/shared-contracts.md](docs/shared-contracts.md)
> - approved migrations and the implementer guard → [docs/hand-written-migrations.md](docs/hand-written-migrations.md) § With the implementer agent
> - the author's reverted lesson solutions, session notes, cost plumbing → [docs/lesson-log.md](docs/lesson-log.md)
> - `git stash` on an untracked file in a red-proof → [TESTING.md](TESTING.md) § Conventions
> - hook end-to-end testing, hooks failing open → [.claude/hooks/README.md](.claude/hooks/README.md);
>   the `.it.test` `FAKE_HOME` trap, a fresh headless session → [.claude/agents/README.md](.claude/agents/README.md);
>   skill authoring → [.claude/skills/README.md](.claude/skills/README.md); old `server/specs/` paths → [specs/README.md](specs/README.md)

## What Works

## What Doesn't Work

- 2026-09-24 — Any Bash command whose TEXT contains a push command — a heredoc
  writing markdown that quotes one, `python3 - <<EOF`, even a `grep` for the
  string — is DENIED by the pr-self-review gate, which regex-tests the whole
  command before anything else and then reports a stale report, not the real
  cause (hit again 2026-10-05 by a grep) → write file content with Write/Edit,
  and search for such strings with the Grep tool, not Bash.
  (ref: .claude/hooks/pr-self-review-gate.mjs)

- 2026-09-20 — Do NOT create a `CLAUDE.md` or `CLAUDE.local.md` here: the default
  `instructionFiles` mode (`claude-md-or-agents-md`) drops EVERY `AGENTS.md` the
  moment the project has a `CLAUDE.md` of its own, and the engine counts
  `CLAUDE.md`, `.claude/CLAUDE.md` AND `CLAUDE.local.md` as that — so one
  developer's untracked `CLAUDE.local.md` silently strips the root plus all four
  package instruction files, with no warning (measured with a canary per file via
  `claude -p`). On 2.1.278 `"instructionFiles": "claude-md-and-agents-md"` and the
  legacy `projectInstructions: "both"` are both NO-OPs, though the setting is
  checked in anyway. (ref: .claude/settings.json:2)

## Codebase Patterns

## Tool & Library Notes

- 2026-10-06 — `Artifact read` on a Claude Design UI prototype saves a bundler
  page, not readable screens: its JSX is gzip+base64 inside
  `<script type="__bundler/manifest">` (one ~1.8 MB line, too long for one
  Read), so a grep for labels in it finds nothing → before handing it to
  spec-creator, JSON-parse the manifest, base64-decode and gunzip each entry
  whose `compressed` is true, and name each module by its leading
  `/* screen_x.jsx — … */` comment; a doc-style artifact (field manual) is
  plain HTML — strip tags instead. (ref: .claude/agents/README.md:61, L05
  project-context spec)

- 2026-09-20 → 2026-10-05 — `grep` at the Bash TOOL prompt is **ugrep** (a zsh
  function from `~/.claude/shell-snapshots/`, not exported), and that shell is
  **zsh**: a BRE backreference dies with a non-zero exit that looks like a
  passing `||` check; a `$` inside a pattern is an anchor, so
  `grep -n 'x "$tmp"'` finds nothing and a `grep … && sed -i …` chain skips the
  edit silently; `"$t:a.ts"` (git's `<tree>:<path>`) expands zsh's `:a`
  modifier. A `bash` script (`scripts/*.sh`, hooks) runs BSD `/usr/bin/grep`
  instead → match positive forms, use `grep -F` for a literal `$`, write
  `"${t}:a.ts"`, confirm an edit with `git diff`, and prove a script's patterns
  by running the script under `bash` and `/bin/bash` 3.2.
  (ref: .claude/skills/onion-architecture/SKILL.md §13, scripts/test-spec-lint.sh)

- 2026-10-01 — `git grep -E` here does NOT understand `\s`: the secret pattern
  `(secret|key|token|password)\s*[:=]\s*['"][^'"]{8,}` matched 0 files with exit
  1 — indistinguishable from a clean scan — while the same pattern with
  `[[:space:]]` matched 9 → write POSIX classes (`[[:space:]]`, `[[:alnum:]]`)
  in every `git grep -E` pattern, and prove a new pattern on a planted sample.
  (ref: .claude/agents/security-reviewer.md Step 2)

- 2026-10-02 — Local pnpm is 12.8.1 but CI pins pnpm 10 (`pnpm/action-setup@v4`
  `version: 10`), so a lock file a session creates for a NEW package is only safe
  if it is `lockfileVersion: '9.0'` like server/client → after `pnpm install`
  check `head -1 <pkg>/pnpm-lock.yaml` and prove it with
  `npx -y pnpm@10 install --frozen-lockfile` on a copy (package.json + lock +
  `pnpm-workspace.yaml`) in the scratchpad; esbuild also needs
  `allowBuilds: esbuild: true` in the package's own `pnpm-workspace.yaml`.
  (ref: mcp-server/pnpm-workspace.yaml, .github/workflows/mcp-server.yml)

## Recurring Errors & Fixes

- 2026-09-21 → 2026-10-02 — A check shipped without being RUN passes vacuously,
  five times: the ugrep backreference; `frontend-ui-architecture` §15's `fetch(`
  matching `refetch()`; an e2e flow command form that does not exist
  (`e2e/INSIGHTS.md` 2026-09-22); the L04 plan's done-when
  `grep -rn "fetch(" mcp-server/src` (the code calls an injected `fetchImpl(`,
  0 hits = "pass") and `grep "^import" | grep -v "'zod'"` (never empty); and
  done-when `git grep` over brand-new folders, which skips UNTRACKED files →
  treat every "Enforcement" section, flow and done-when check as untested code:
  give it one planted hit that must appear and one that must not, ship its
  expected output beside it (`.claude/skills/pr-self-review/greps.md` § The
  patterns), use `grep -rn` or `git grep --untracked` on uncommitted work, and
  prefer a test that parses imports (`mcp-server/test/boundaries.test.ts`).

## Session Notes

One line per session lives in [docs/lesson-log.md](docs/lesson-log.md).

## Open Questions
