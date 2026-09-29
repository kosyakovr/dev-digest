# Insights — mcp

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

- 2026-09-29 — The shared fixture UUIDs are ALL DIGITS (`PR_ID = '22222222-…'`),
  so `.toUpperCase()` on them is a no-op and a case-insensitivity test built on
  them passes even with the lower-casing deleted → use a local id with hex
  letters (`'ccddeeff-…'`) for any UUID-case test. (ref: mcp/test/helpers/fixtures.ts:9,12;
  mcp/test/resolve.test.ts "UUID case-insensitivity")

- 2026-09-29 — The mcp boundary greps cannot tell code from comments: a ring
  docblock naming the forbidden token ("the only `process.env` reader", "no
  `eventsource`") is a hit, and the implementer reworded four headers → in
  `src/` comments describe the rule without the literal token ("the env reader",
  "the SSE package"). (ref: scripts/fitness-greps.sh `mcp-*` block, greps.md § mcp boundary)

## Codebase Patterns

## Tool & Library Notes

- 2026-09-29 — vitest fake timers: `await vi.advanceTimersByTimeAsync(N)` settles a
  rejection BEFORE a later `await expect(p).rejects…` attaches — the test reports
  "passed" but a `PromiseRejectionHandledWarning` makes the run exit non-zero →
  create `const assertion = expect(p).rejects.toThrow(…)` first, advance the
  timers, then `await assertion`. (ref: mcp/test/use-cases/run-review.test.ts:172,196)
- 2026-09-29 — `@modelcontextprotocol/sdk` 1.31.0: a `registerTool` handler must
  return something assignable to its `z.infer`'d `CallToolResult`, which carries
  an index signature — a hand-written result interface fails with a deep nested
  type error until it declares `[x: string]: unknown`. (ref: mcp/src/tools/result.ts:15,21)

## Recurring Errors & Fixes

## Session Notes

- 2026-09-29 — L04: package created — 5 stdio tools, onion rings, SR-1 untrusted_notice (spec: specs/L04-mcp-server.md).

## Open Questions

- 2026-09-29 — `tsconfig.json` includes only `src/**`, and vitest transpiles
  without type-checking, so a type error in `test/**` passes both `npm run
  typecheck` and `npm test` (test-writer ran an ad-hoc `tsc` over `test/**`).
  Add `test/**` to a `tsconfig.test.json` checked in `mcp.yml`? reviewer-core has
  the same gap.
