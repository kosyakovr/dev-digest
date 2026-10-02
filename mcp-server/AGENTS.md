# mcp-server — @devdigest/mcp-server

Local stdio MCP server for Claude Code: a thin client of the running DevDigest HTTP API
(list agents, run one agent's review on a PR, read findings and conventions). Spec:
[specs/L04-mcp-server.md](specs/L04-mcp-server.md). Overview: [README.md](README.md).

@INSIGHTS.md

## Commands (pnpm — NOT npm)
- `pnpm install --frozen-lockfile`
- `pnpm typecheck` (doubles as the build — nothing is emitted; Node runs the `.ts` directly)
- `pnpm test` (vitest, a fake `DevDigestApi`, no network)
- `node src/index.ts` — the server itself (stdio)

## Must not break
- **stdout carries JSON-RPC only.** No `console.log`, no `process.stdout` writes; logs go to stderr (`src/log.ts`).
- **Ring map** (onion by analogy, see `.claude/skills/pr-self-review/routing.md` § Group A):
  ① `src/core/` ← ② `src/usecases/`, `src/format/` ← ③ `src/adapters/http/` ← ④ `src/tools/`, `src/server.ts`, `src/index.ts`.
  `core` imports `zod` only. `usecases`/`format` import `core` only (no MCP SDK, no `fetch`, no `process.env`, no HTTP status codes).
  `adapters` implement `core`. Only `src/index.ts` constructs adapters and reads `process.env` (via `src/config.ts`).
- Only `src/adapters/http/http.ts` calls `fetch`.
- No import from `../server` or `../reviewer-core`.
- Tool and field descriptions live only in `src/tools/definitions.ts` and match `specs/L04-mcp-server.md` verbatim.
- `pnpm-lock.yaml` is off-limits — see root [../AGENTS.md](../AGENTS.md).
- Erasable TypeScript only (no `enum`, no parameter properties, no `namespace`); `.ts` import extensions; `import type` for type-only imports.
- The only write to the API is `POST /pulls/:id/review`.

## Read when
- Writing tests → [../TESTING.md](../TESTING.md)
- Implementing a feature → [specs/](specs/)
