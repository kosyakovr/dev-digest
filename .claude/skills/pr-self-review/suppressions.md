# Suppressions

Every time this gate's verdict was overridden — a waiver, a dispute-downgrade, a
verifier `drop`, a break-glass bypass. Checked in, unlike the report itself, which
lives in `.git/` and never leaves the machine.

This file exists because **a suppression is evidence that a rule is wrong,
ambiguous, or missing an exception** — not noise to discard. Without it the system
only decays: rules stay imprecise, people learn to reach for the bypass, and the
gate gets deleted.

- Entry: `- YYYY-MM-DD — <source_skill> <source_rule> — <how> — <why>. (ref: <finding id>)`
  where `<how>` is one of `waived`, `disputed`, `dropped by verifier`, `bypassed`.
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- **At 3+ entries for the same `source_rule`, stop suppressing quietly.** Propose a
  concrete fix: add the case to `onion-architecture` §11, tighten the grep pattern,
  narrow the rule to `A`-status files, or hand the lesson to the
  `engineering-insights` skill. Propose it — never edit another skill unprompted.
- A rule suppressed five times is a rule that should be deleted. This file is what
  makes that visible instead of arguable.

## Entries

_None yet._
