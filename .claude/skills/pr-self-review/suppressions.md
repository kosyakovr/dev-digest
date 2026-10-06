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

- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — client/src/vendor/shared/adapters.ts "+/- lines differ from twin". The twins are byte-identical at HEAD; the client hunks are the WP0 re-sync of drift that was already at the merge-base. (ref: twin-1)
- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — client/src/vendor/shared/contracts/eval-ci.ts "twin was not changed". A client-only edit that converges a pair already drifted at the merge-base; byte-identical at HEAD. (ref: twin-2)
- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — client/src/vendor/shared/contracts/knowledge.ts "twin was not changed". Same as twin-2. (ref: twin-3)
- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — client/src/vendor/shared/contracts/productionize.ts "twin was not changed". Same as twin-2. (ref: twin-4)
- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — client/src/vendor/shared/contracts/trace.ts "+/- lines differ". Same as twin-1. (ref: twin-5)
- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — server/src/vendor/shared/adapters.ts "+/- lines differ". The mirror of twin-1. (ref: twin-6)
- 2026-10-06 — AGENTS.md Cross-package invariants — dropped by verifier — server/src/vendor/shared/contracts/trace.ts "+/- lines differ". The mirror of twin-5. (ref: twin-7)
