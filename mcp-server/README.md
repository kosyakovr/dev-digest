# @devdigest/mcp-server

A local stdio [MCP](https://modelcontextprotocol.io) server named `devdigest`. It lets Claude Code
list DevDigest reviewer agents, run one agent on a pull request, and read stored findings and
conventions. It only talks to the running DevDigest API over HTTP: no database, no import of
`server/` or `reviewer-core/`.

## Setup
0. Node >= 22.18 (it runs TypeScript natively via type stripping; older 22.x fails with an unknown-extension error).
1. Start the API: `./scripts/dev.sh` (or `cd server && pnpm dev`).
2. `cd mcp-server && pnpm install --frozen-lockfile`
3. Claude Code reads the root `.mcp.json`; approve `devdigest` in `/mcp`.

## Tools
| Tool | What it does |
|---|---|
| `list_agents` | Lists reviewer agents (name, model, enabled). |
| `run_agent_on_pr` | Runs one agent on a PR (paid LLM call); blocks up to ~110 s, else returns `status running` + `run_id`. |
| `get_findings` | Reads findings of a finished review (latest, by `run_id` or by agent). |
| `get_conventions` | Reads a repo's conventions (accepted by default). |
| `get_blast_radius` | Not implemented yet; always returns an error. |

## Environment
- `DEVDIGEST_API_URL` — default `http://localhost:3001`; must be `http:` or `https:`.
- `DEVDIGEST_MCP_LOG` — `error|info|debug`, default `info` (stderr).

## Inspect
`npx @modelcontextprotocol/inspector --cli node mcp-server/src/index.ts --method tools/list`

## Layers
```
src/core/            ① port DevDigestApi, zod schemas, DevDigestError   (imports zod only)
src/usecases/        ② resolve, run-review, findings, conventions       (imports core)
src/format/          ② text rendering                                    (imports core)
src/adapters/http/   ③ fetch + SSE implementation of the port           (implements core)
src/tools/ server.ts index.ts   ④ MCP SDK, composition root
```
Spec: [specs/L04-mcp-server.md](specs/L04-mcp-server.md).
