# Insights — mcp-server

Non-obvious findings a future session needs. **Read this before working here.**

- Entry: `- YYYY-MM-DD — <what surprised us> → <what to do instead>. (ref: file:line / PR)`
- Append only. Never rewrite an entry — correct it with a dated line beneath it.
- Never trim this file yourself — past 100 lines, propose a consolidation pass.
  It is `@import`ed into every session for this package, so length has a real cost.
- Settled knowledge moves to [docs/](docs/); this file is the draft, not the doc.
- Captured by the `engineering-insights` skill.

## What Works

## What Doesn't Work

- 2026-10-02 — A fake `Clock` whose `sleep()` resolves at once breaks every
  deadline test: `waitOnStream` uses `clock.sleep` AS the wait deadline, so an
  instant sleep aborts the SSE wait before the first event → reuse `FakeClock`
  (`test/fakes.ts`: `sleep` registers a timer, `await clock.run(promise)` jumps
  time only when everything else is idle) instead of writing a simpler fake.
  (ref: src/usecases/run-review.ts waitOnStream, test/fakes.ts:38)

## Codebase Patterns

## Tool & Library Notes

- 2026-10-02 — `@modelcontextprotocol/sdk` 1.31.0 `McpServer.registerTool`
  itself advertises `capabilities.tools.listChanged: true` on `initialize` and
  adds `execution: {taskSupport: 'forbidden'}` to every tool in `tools/list`,
  though this server never emits `list_changed` → do not assert either absent
  in tests, and do not "fix" them in `server.ts`. (ref: src/server.ts, test/mcp-server.test.ts)

## Recurring Errors & Fixes

## Session Notes

- 2026-10-02 — L04: package created — 5 stdio tools, onion rings, SR-1 quoted locations, 146 tests (spec: specs/L04-mcp-server.md).

## Open Questions
