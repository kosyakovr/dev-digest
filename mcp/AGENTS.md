# mcp — @devdigest/mcp

Local MCP server (stdio): a thin client over the DevDigest HTTP API, exposing
five tools to any MCP client (Claude Code first). Overview & the full contract:
[specs/L04-mcp-server.md](specs/L04-mcp-server.md).

@INSIGHTS.md

## Commands (npm — NOT pnpm)
- `npm run typecheck` · `npm run build` (emits `dist/`, git-ignored — build
  before starting the server) · `npm test` (vitest, hermetic)
- everything CI runs, recorded per tree: `../scripts/check-all.sh` (from the
  repo root: `scripts/check-all.sh --pkg mcp`)

## Must not break
- **Rings** (onion-architecture, by analogy — the skill is scoped to
  `server/`, but its dependency-direction rule binds here too):

  | Ring | Files | May import | Must not import |
  |---|---|---|---|
  | ① Contracts + port | `src/contracts.ts`, `src/ports.ts`, `src/errors.ts`, `src/constants.ts` | `zod` | everything else |
  | ② Use cases | `src/use-cases/*.ts`, `src/resolve.ts`, `src/format.ts` | ①, each other | the SDK, `fetch`, the environment, `api/`, `tools/`, `server.ts`, `index.ts`, `config.ts`, `log.ts` |
  | ③ Adapter | `src/api/http.ts`, `src/api/sse.ts`, `src/api/fake-api.ts` | ①, `log.ts`, `fetch`, `TextDecoder` | `use-cases/`, `resolve`, `format`, `tools/`, the SDK |
  | ④ Boundary + composition | `src/tools/*.ts`, `src/server.ts`, `src/index.ts` | everything except `api/` values | — |
  | cross-cutting | `src/config.ts` (the ONLY environment reader), `src/log.ts` (stderr only) | node built-ins | — |

- **Handler parses, delegates, maps.** Each `registerTool` callback is
  `wrap(name, …)` around exactly one call into `../use-cases/`. No
  `api.`/`resolver.` call in `src/tools/`.
- **Boundary greps**: `scripts/fitness-greps.sh` (patterns:
  `.claude/skills/pr-self-review/greps.md` § mcp boundary) — 8 checks, each
  must print nothing on an unchanged boundary.
- stdout carries MCP JSON-RPC messages only — every log line goes through
  `src/log.ts` (stderr). Never `console.log`/`console.info`/`process.stdout.write`.
- No imports from `server/`, `client/` or `reviewer-core/` in `src/` (this
  package is a standalone HTTP client, not a consumer of server internals).
- `mcp/package-lock.json` is off-limits — see root [../AGENTS.md](../AGENTS.md).
- Never call `POST /runs/:id/cancel`, `POST /repos`, or
  `POST /repos/:id/conventions/extract` — out of scope (see the spec's
  Non-goals).
- `@devdigest/shared` schemas are mirrored here as small, lenient local wire
  schemas in `src/contracts.ts` — never import `@devdigest/shared` directly
  at runtime; `mcp/test/contract-pin.test.ts` is the only place it is used
  (as a test-time check against drift).

## Read when
- Implementing or changing a tool → [specs/](specs/) · deeper design in
  [specs/L04-mcp-server.md](specs/L04-mcp-server.md).
- Writing tests → [../TESTING.md](../TESTING.md).
- Setup / running against a live server → [README.md](README.md).
