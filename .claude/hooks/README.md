# Hooks

## `pr-self-review-gate`

A `PreToolUse` hook that denies `git push` and `gh pr create|merge|ready` while the
[`pr-self-review`](../skills/pr-self-review/SKILL.md) gate is failing or stale.

**It cannot stop a merge.** `PreToolUse` fires only on Claude Code's `Bash` tool. A
push from a terminal, the VSCode Git panel, GitHub Desktop, or "Create pull
request" on github.com never reaches it. This is a self-discipline aid for the
agent-driven workflow. Real enforcement is a required GitHub check.

| File | Role |
|---|---|
| `pr-self-review-gate.sh` | Entry point. Resolves `node`, fails **safe** if it cannot. |
| `pr-self-review-gate.mjs` | The gate. Node built-ins only — lock files are off-limits here. |
| `test-gate.sh` | 23 offline cases. No model, no network, no API key. |

### What it does

1. Regex-tests the whole command string — compound commands (`a && git push`) are
   caught. `--dry-run`, `--delete` and `--tags` are exempt. **This happens before
   any subprocess**, so almost every Bash call in a session exits in ~40 ms.
2. Reads `$(git rev-parse --absolute-git-dir)/devdigest/pr-self-review.json`.
3. Denies if it is missing, unparseable, `mode: "fast"`, or stale — where stale
   means `branch`, `merge_base`, `head_sha` or `skills_digest` no longer match.
4. Recomputes the blockers itself from `findings[]`. **`report.gate` is never
   trusted**, the same way the product recomputes the model's score.
5. Denies if any unwaived, un-downgraded CRITICAL remains.

On a pass it prints **nothing** and exits 0. It never returns
`permissionDecision: "allow"` — that would bypass the normal permission prompt and
silently auto-approve every push.

### Overriding a false positive

**Waive one finding.** Create `.git/devdigest/pr-self-review.override.json`:

```json
{ "head_sha": "<the exact sha the report was written for>",
  "waived": [{
    "finding_id": "backend-architecture-1",
    "reason": "At least 40 characters explaining why this specific finding does not apply here.",
    "waived_by": "you@example.com",
    "waived_at": "2026-09-21T10:31:07Z"
  }] }
```

A waiver is honoured only when the sha matches current HEAD — **waivers do not
survive a new commit**, so you re-justify after changing the code. A reason under
40 characters is rejected as unauditable. Since `.git/` never leaves the machine,
also paste the trailer the skill prints into the PR description:

```
PR-Self-Review-Waiver: backend-architecture-1 — <reason>
```

**Dispute it** instead if you think the *review* is wrong rather than the rule
inapplicable: `/pr-self-review --dispute <id> "<argument>"` re-runs the verifier
with your argument, and it downgrades on the record if convinced.

**Break glass:** `PR_SELF_REVIEW_BYPASS=1 git push`. Allowed, and loudly announced
in the transcript. Log why in
[`suppressions.md`](../skills/pr-self-review/suppressions.md) — a rule that keeps
getting bypassed is a rule that needs fixing or deleting.

### Turning it off

Delete the `hooks` block from `.claude/settings.json`. Nothing else depends on it;
the skill still works when invoked by hand.

### Failure modes, by design

| Situation | Decision | Why |
|---|---|---|
| Report missing / stale / `fast` | `deny` | Nothing is known about the change |
| Unwaived CRITICAL | `deny` | The gate's whole purpose |
| Git missing, report unparseable, gate throws | `ask` | Our bug must not decide the push either way |
| `node` unresolvable | `ask` | See below |
| Pass | silent exit 0 | Leaves the normal permission flow intact |

**The `node` resolution problem.** A hook that exits non-zero is treated as an
*error* and the tool runs anyway. On this machine `node` is an asdf shim and
`env -i sh -c 'command -v node'` finds nothing — so a gate invoking `node` directly
could fail **open**, which is the worst possible outcome. The `.sh` wrapper
therefore tries `command -v node`, then asdf, volta, Homebrew, `/usr/local`,
`/usr/bin`, then the newest nvm/fnm install; and if all fail it emits an `ask`
decision and exits 0. `test-gate.sh` case 23 asserts this under `env -i`.

### After changing anything here

```bash
.claude/hooks/test-gate.sh
```

It builds a throwaway repo in `$TMPDIR`, so it never touches the real report.
