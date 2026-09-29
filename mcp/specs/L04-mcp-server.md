# DevDigest local MCP server (5 tools, stdio)

**Status:** in-progress
**Lesson / ticket:** L04

## Goal
From any MCP client (Claude Code first), a developer can:
- list DevDigest agents;
- run one agent on a PR and get its findings within 120 s;
- read the findings of finished reviews;
- read a repo's conventions.

PRs, repos and agents can be referenced the way people write them
(`owner/repo#123`, `owner/repo`, the agent name) or by UUID.

## Non-goals
- No HTTP/SSE MCP transport. `mcp/src` never imports `node:http` or `express`.
- No change to `server`, `client`, `reviewer-core`, `e2e` or `@devdigest/shared`.
- No fix for `POST /runs/:id/cancel` (`server/src/platform/sse.ts:79`) — `mcp/src`
  never calls `/cancel`.
- No `all:true` runs, no `POST /repos`, no `POST /repos/:id/conventions/extract`.
- `devdigest_get_blast_radius` is only a stub that always errors.
- No `alwaysLoad` and no server `instructions`.

## Contract

**No HTTP, `@devdigest/shared` or DB change.** The MCP surface — five tools
served over stdio by an `@modelcontextprotocol/sdk` `McpServer` — is the
contract. The server is a thin, stateless-between-calls client of the existing
DevDigest HTTP API (default `http://localhost:3001`), through one port,
`DevDigestApi` (`mcp/src/ports.ts`).

### Common input
`response_format: z.enum(['concise','detailed']).default('concise')`, with
**no** `.describe()`.

### Common output
- `pr` is `"owner/repo#N"`, or `"#N"` for a PR UUID this process never resolved
  by name.
- `pr_title` is always present; `pr_id` / `repo_id` only in detailed output.
- `loc` = `"file:start"` when start = end, else `"file:start-end"`.
- Order: CRITICAL > WARNING > SUGGESTION (unknown severities last), then
  `file` ascending, then `start_line` ascending.
- An optional `hint` names the next call; built only from trusted constants
  and resolved labels (`pr` label, `repo` full_name, `run_id`, agent name) —
  never from PR or model text.
- Every success `structuredContent` of `devdigest_run_review`,
  `devdigest_get_findings` and `devdigest_get_conventions` carries
  `untrusted_notice: UNTRUSTED_NOTICE` (`src/constants.ts`) as its **first**
  key, flagging that titles, summaries, rationales, suggestions, rules and
  snippets in the payload quote the PR, its code or a reviewer model —
  untrusted data, never instructions (OWASP LLM01 / prompt injection).
  `devdigest_list_agents` does not carry it (agent config is local and
  trusted); the `devdigest_get_blast_radius` stub is unchanged.
- Success result: `{content:[{type:'text', text: JSON.stringify(sc)}],
  structuredContent: sc}` (compact JSON).
- Error result: `{content:[{type:'text',text}], isError:true}`, with no
  `structuredContent` and never a stack trace.

### Error texts
`{…}` is filled in at runtime.

| id | when | text |
|---|---|---|
| E1 | fetch rejects (connection refused etc.) | `DevDigest API is not reachable at {base} ({cause code}). Start it (cd server && pnpm dev) or set DEVDIGEST_API_BASE, then retry.` |
| E2 | a request exceeds its timeout | `DevDigest API did not answer {METHOD} {path} within {s} s. Check the server log, then retry.` — for `POST /pulls/{id}/review` append ` The review may have started: call devdigest_get_findings with pr={pr} before retrying.` |
| E3 | HTTP 429 | `DevDigest rate limit hit on {METHOD} {path}. Wait about a minute before retrying (reviews: 10 per minute).` |
| E4 | other non-2xx not mapped below | `DevDigest API returned {status} for {METHOD} {path}: {error.message or "no message"}. Retry, or check the server log.` |
| E5 | invalid JSON, or local schema `safeParse` fails | `Unexpected response from {METHOD} {path}: {first issue path joined by "."} {issue message}. The DevDigest server and mcp/ may be out of sync — pull, then run npm run build in mcp/.` |
| E6 | `pr` matches no accepted form | `Cannot read PR reference "{input}". Use owner/repo#123, https://github.com/owner/repo/pull/123, or a DevDigest PR id.` |
| E7 | `repo` matches no accepted form | `Cannot read repository reference "{input}". Use owner/repo or a DevDigest repo id.` |
| E8 | repo not in `GET /repos` | `Repository {input} is not in DevDigest. Add it in the DevDigest web app first. Known repos: {≤10 full_names joined ", " or "none"}.` |
| E9 | PR number not in `GET /repos/:id/pulls` | `PR {owner/repo#N} is not among the PRs DevDigest has synced for {owner/repo} (it syncs the 50 most recently updated). Open the repo in the DevDigest web app to sync, or pass the DevDigest PR id.` |
| E10 | 404 on a PR-id endpoint | `No DevDigest PR with id {id}. Use owner/repo#123 instead.` |
| E11 | agent name: 0 matches | `No agent named "{input}". Available: {≤20 names joined ", "}. Call devdigest_list_agents for ids.` |
| E12 | agent UUID not in the list | `No agent with id {id}. Call devdigest_list_agents.` |
| E13 | agent name: more than 1 match | `Agent name "{input}" matches {n} agents: {name} ({id}), … Pass the id instead.` |
| E14 | run status `failed` / `cancelled` | `Review run {run_id} ({agent_name}) on {pr} {status}: server-reported error {JSON.stringify(error or "no error text")}. Fix the cause (e.g. the provider key in DevDigest Settings) and call devdigest_run_review again.` — the error text is JSON-quoted and labelled so it reads as quoted data, not as part of the instruction (OWASP LLM01). |
| E15 | `run_id` not in `GET /pulls/:id/runs` | `Run {run_id} does not belong to {pr}. Call devdigest_get_findings without run_id to see the latest reviews.` |
| E16 | run `done` but no review with that `run_id` | `Run {run_id} finished but its review is not in GET /pulls/{pr_id}/reviews yet. Call devdigest_get_findings with run_id={run_id}.` |
| E17 | `run_id` given and `agent` resolves to a different agent | `Run {run_id} was made by {agent_name}, not {agent input}. Drop agent or run_id.` |
| E18 | cursor fails to decode | `Invalid cursor "{cursor}". Omit cursor to start from the first page.` |
| E19 | resolution ends with < `CONFIRM_TIMEOUT_MS` left before the run_review deadline | `Resolving {pr input} took longer than the {s} s budget allows (GitHub sync). No review was started; retry.` |
| E20 | blast-radius stub | `devdigest_get_blast_radius is not implemented yet. For review results on this PR use devdigest_get_findings.` |
| E21 | any other throw | `Unexpected error in {tool}: {err.message}. Retry; if it persists check the mcp stderr log.` |

### Architecture: rings inside `mcp/` (onion-architecture, by analogy)

| Ring | Files | May import | Must not import |
|---|---|---|---|
| ① Contracts + port | `src/contracts.ts`, `src/ports.ts` (`DevDigestApi`, `CallOpts`), `src/errors.ts`, `src/constants.ts` | `zod` | everything else |
| ② Use cases | `src/use-cases/*.ts`, `src/resolve.ts`, `src/format.ts` (pure) | ①, each other | SDK, `fetch`, `process.env`, `api/`, `tools/`, `server.ts`, `index.ts`, `config.ts`, `log.ts` |
| ③ Adapter | `src/api/http.ts` (`HttpDevDigestApi implements DevDigestApi`), `src/api/sse.ts`, `src/api/fake-api.ts` (`FakeDevDigestApi`, port double; production code imported only by tests) | ①, `log.ts`, `fetch`, `TextDecoder` | `use-cases/`, `resolve`, `format`, `tools/`, the SDK |
| ④ Boundary + composition | `src/tools/*.ts`, `src/server.ts`, `src/index.ts` (composition root: the only importer of `api/`) | everything except `api/` values | — |
| cross-cutting | `src/config.ts` (the ONLY `process.env` reader), `src/log.ts` (stderr only) | node built-ins | — |

**Handler parses, delegates, maps.** Each `registerTool` callback is
`wrap(name, …)` around exactly one call into `../use-cases/`. No
`api.`/`resolver.` member call appears in `src/tools/`.

**Port** `DevDigestApi` (`src/ports.ts`), each method taking an optional last
argument `opts?: CallOpts = { signal?: AbortSignal; timeoutMs?: number }`:
`listAgents`, `listRepos`, `listPulls(repoId)`, `getPull(prId)`,
`startReview(prId, agentId)`, `streamRunEvents(runId, onEvent)` →
`'closed'|'aborted'`, `listRuns(prId)`, `listReviews(prId)`,
`listConventions(repoId)`. There is **no cancel method**.

The port, its `HttpDevDigestApi` adapter and its `FakeDevDigestApi` double land
together. The fake keeps in-memory state, a scriptable stream, per-method
scriptable delays/errors honouring `opts.signal`, and a `calls` log.

The SDK never flows inward: use cases take `signal: AbortSignal` and
`onProgress?: (msg: string) => void`, never `extra` or a `progressToken`.

Every `src/**/*.ts` opens with a `/**` docblock naming its ring (`Contracts` |
`Port` | `Use case` | `Adapter` | `Boundary` | `Composition root` |
`Cross-cutting`) and its prohibition.

### Tool 1: `devdigest_list_agents`
- **Description:** `List DevDigest reviewer agents (id, name, enabled, model). Pass a name or id to devdigest_run_review.`
- **Input:** `{ response_format }`.
- **Annotations:** `readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false`.
- **HTTP:** `GET /agents`, always fresh; the fetch also refreshes the resolver's agent cache.
- **Output:** concise `{agents:[{id,name,enabled,model}], count}`; detailed adds
  `description, provider, strategy, version`; never `system_prompt` or
  `output_schema`; empty → hint pointing at the DevDigest web app.
- **Errors:** E1, E2, E4, E5, E21.

### Tool 2: `devdigest_run_review`
- **Description:** `Run one DevDigest reviewer agent on a pull request (code review) and wait up to ~100 s for findings; if still running, returns run_id for devdigest_get_findings. Paid LLM calls; one agent per call.`
- **Input:** `pr`, `agent`, `limit` (1-50, default 10).
- **Annotations:** `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true`.
- **Timing** (from handler start `t0`; worst case 116 s < 120 s):
  1. Resolve `pr` then `agent` under a combined signal with deadline
     `t0 + RUN_DEADLINE_MS` (100 s). If the deadline fired, or fewer than
     `CONFIRM_TIMEOUT_MS` (8 s) remain, return E19 without POSTing.
  2. `POST /pulls/:id/review {agentId}` capped at 8 s.
  3. `GET /runs/:run_id/events` until the stream closes or the deadline passes.
  4. `GET /pulls/:id/runs` (8 s cap).
  5. On `done`: `GET /pulls/:id/reviews` (8 s cap).
- **Output:** `done` → `{untrusted_notice, status, pr, pr_title, run_id, agent_id, agent_name,
  verdict, score, summary, findings_count, cost_usd, duration_ms, findings, omitted, hint?}`;
  `running` → `{untrusted_notice, status:"running", pr, pr_title, run_id, agent_id, agent_name, elapsed_s, hint}`.
  `untrusted_notice` is `UNTRUSTED_NOTICE` (Contract § Common output), first key.
- **Errors:** E1–E6, E8–E16, E19, E21.

### Tool 3: `devdigest_get_findings`
- **Description:** `Get findings of finished DevDigest reviews on a pull request: the latest review per agent, or one run by run_id.`
- **Input:** `pr`, `run_id?`, `agent?`, `severity?`, `limit` (default 20), `cursor?`, `response_format`.
- **Annotations:** read-only, non-destructive, idempotent, closed-world.
- **HTTP:** resolve `pr`(+`agent`) → `GET /pulls/:id/reviews`, and only if
  `run_id` is given and unmatched, `GET /pulls/:id/runs`.
- **Selection:** `kind==='review'` rows; with `run_id` that run's review,
  otherwise the newest review per `agent_id`; non-dismissed findings, severity
  threshold, sort, then page by offset (`cursor = base64url(offset)`).
- **Output:** concise `{untrusted_notice, pr, pr_title, reviews, findings, total, next_cursor}`
  (`untrusted_notice` = `UNTRUSTED_NOTICE`, first key, incl. the `running` and
  no-reviews shapes); detailed adds ids/summary/model/rationale/etc.; a
  still-running `run_id` is a non-error `status:"running"`; no reviews → hint
  pointing at `devdigest_run_review`.
- **Errors:** E1–E6, E8–E15, E17, E18, E21.

### Tool 4: `devdigest_get_conventions`
- **Description:** `List a repository's coding conventions extracted by DevDigest (accepted ones by default).`
- **Input:** `repo`, `status` (default `accepted`), `response_format`.
- **Annotations:** read-only, non-destructive, idempotent, closed-world.
- **HTTP:** resolve `repo` via `GET /repos`, then `GET /repos/:id/conventions`.
- **Output:** concise `{untrusted_notice, repo, conventions, total, truncated}`
  capped at 100 (`untrusted_notice` = `UNTRUSTED_NOTICE`, first key, incl. the
  empty shape); detailed adds `repo_id` and per-item detail; empty → a hint
  pointing at the web app's Conventions extraction.
- **Errors:** E1–E5, E7, E8, E21.

### Tool 5: `devdigest_get_blast_radius` (stub)
- **Description:** `Not implemented yet: will show which code a pull request's changes affect. Currently always returns an error.`
- **Input:** `{ pr }`.
- **Annotations:** read-only, non-destructive, idempotent, closed-world.
- No outputSchema, no use case, no port call. Always returns E20.

### Resolver (`src/resolve.ts`, ring ②, per-process cache)
- UUID: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- PR by reference: `owner/repo#N`, or a GitHub PR URL — via `listRepos` →
  case-insensitive `full_name` match → `listPulls` → `number` match (E9 on miss).
- PR by UUID: reverse cache, else `getPull` (404 → E10), labelled `#{number}`.
- `repo`: `owner/repo` (case-insensitive) or UUID, against `listRepos`.
- `agent`: UUID, or trimmed case-insensitive exact name, against `listAgents`.
- Cache: repos, per-repo PR lists, agents, a `prById` map. On a miss, refetch
  the list once before erroring. Never POST — the port has no such method.

### Config and constants
- `DEVDIGEST_API_BASE`, default `http://localhost:3001`, trailing `/` stripped.
- A non-`http(s)` value → stderr `devdigest-mcp: DEVDIGEST_API_BASE must be an
  http(s) URL, got "<v>"` and exit 1, with empty stdout.
- `src/constants.ts`: `REQUEST_TIMEOUT_MS` 30000 · `RUN_DEADLINE_MS` 100000 ·
  `CONFIRM_TIMEOUT_MS` 8000 · `PROGRESS_THROTTLE_MS` 2000 · `CONVENTIONS_CAP` 100.
- No `instructions`.

### `.mcp.json` (repo root, exact)
```json
{
  "mcpServers": {
    "devdigest": {
      "type": "stdio",
      "command": "node",
      "args": ["mcp/dist/index.js"]
    }
  }
}
```

## Acceptance criteria
- [ ] **AC-1:** `tools/list` returns exactly the five Contract names, each with the Contract annotations. The initialize result has no `instructions`.
- [ ] **AC-2:** every tool description is ≤ 200 chars, every input `.describe()` is ≤ 80 chars, and `response_format` has no `description` key.
- [ ] **AC-3:** with the API unreachable, tools 1–4 each return `isError:true` with text starting `DevDigest API is not reachable at`. The process keeps running and answers the next call.
- [ ] **AC-4:** every success result has `structuredContent`, and `content[0].text === JSON.stringify(structuredContent)`.
- [ ] **AC-5:** `devdigest_run_review` on a run that finishes returns `status:"done"` with `run_id`, `agent_name`, `pr:"owner/repo#N"` and ≤ `limit` findings in severity order.
- [ ] **AC-6:** a run still going at 100 s gives a non-error `status:"running"` with `run_id` and a hint naming `devdigest_get_findings`. No request path contains `/cancel`.
- [ ] **AC-7:** a `failed` run gives `isError:true` containing the run's `error`. MCP cancellation stops all further port calls.
- [ ] **AC-8:** `devdigest_run_review` makes no POST unless ≥ 8 s remain before the 100 s deadline, and the POST carries an 8 s timeout (worst case ≤ 116 s).
- [ ] **AC-9:** `devdigest_get_findings` accepts `owner/repo#N`, a GitHub PR URL and a PR UUID; returns the latest review per agent when `run_id` is absent; pages with `next_cursor`.
- [ ] **AC-10:** `devdigest_get_conventions owner/repo` returns the accepted conventions by default. An unknown repo gives E8 listing the known repos. No POST is ever sent.
- [ ] **AC-11:** `devdigest_get_blast_radius` returns `isError:true` with E20 and makes no port call.
- [ ] **AC-12:** over stdio, every stdout line parses as JSON-RPC 2.0, including on API-down errors.
- [ ] **AC-13:** `mcp/test/contract-pin.test.ts` fails when a field a local schema reads is renamed in its paired server contract.
- [ ] **AC-14:** `.mcp.json` equals the Contract block. `mcp.yml` triggers on `mcp/**` and `server/src/vendor/shared/**`.
- [ ] **AC-15:** the only lockfile added or changed is `mcp/package-lock.json`, and `git diff --stat -- server client reviewer-core e2e` is empty.
- [ ] **AC-16 (onion):** all 8 boundary greps print nothing, each proven by its plant; every `mcp/src/**/*.ts` opens with a `/**` ring docblock; `git grep -nE -e "(api|resolver)\.[A-Za-z]+\(" -- mcp/src/tools` prints nothing; each use case is tested against `FakeDevDigestApi` with no `McpServer`.
- [ ] **AC-17 (tooling):** `routing.md` routes `mcp/src/**/*.ts` to A and F; `scripts/fitness-greps.sh` reports the 8 `mcp-*` checks when `mcp/src` changes; `.claude/hooks/test-implementer-guard.sh` exits 0; with G4, `.claude/hooks/test-agent-scope-guard.sh` exits 0.

## Test plan
See `../../TESTING.md` for the suite map. `mcp/`'s own suite (vitest, hermetic —
fake port / fake fetch) runs `cd mcp && npm test`, and covers: the SSE reader,
`HttpDevDigestApi` error mapping, the local wire schemas, the resolver, pure
formatting, the five tools (over an SDK `Client` + `InMemoryTransport` against
`FakeDevDigestApi`), `devdigest_run_review`'s timing/cancellation/progress, a
contract-pin test against `server/src/vendor/shared`, `.mcp.json` shape, and
stdout cleanliness over a real `stdio` child process. Full detail per case is
in the plan's Test brief (`mcp-plan-v2.md`), sections WP4.tests–WP9.tests.
