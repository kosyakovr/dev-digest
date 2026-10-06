# Blast radius (card on Overview + Prior PRs + MCP `get_blast_radius`)

**Status:** in-progress
**Lesson / ticket:** L04

One spec for the cross-package feature. Client part: [../../client/specs/L04-blast-radius.md](../client/specs/L04-blast-radius.md). MCP part: [../../mcp-server/specs/L04-mcp-server.md](../mcp-server/specs/L04-mcp-server.md).

## Goal
1. The PR Overview shows a "Blast radius" card: 4 counters (symbols / callers / endpoints / crons), a Tree/Graph switch, per-symbol callers `file:line` (direct and indirect, links pinned to `indexed_sha`), then HTTP endpoints and crons; below it an accordion "Prior PRs touching these files".
2. The `repoIntel.getBlastRadius` facade reads only the persistent index and reports honestly when data is missing or incomplete.
3. MCP `get_blast_radius` returns a compact text blast radius for a PR via the same route.

## Non-goals
- No LLM call; `summary` is a string of numbers.
- No migrations, no `server/src/db/schema*` change, no new dependencies, no history cache table.
- "Changed symbols" are not narrowed to changed hunks: all symbols declared in changed files.
- `getCallerSignatures` / `getUnresolvedReferences` and `run-executor` are unchanged (they still read the clone).
- `CLONE_DEPTH`, `GitClient` and `MockGitClient` are untouched; history never reads the clone.
- `client/src/vendor/shared/adapters.ts` drift from the server copy is not synchronised; only the new members are added to both copies.

## Contract
**Zod, both vendored `contracts/brief.ts` copies byte-identical; additive optional only:**
```ts
export const BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data']);
BlastCaller  += { depth: z.number().int().min(1).optional(), through: z.string().optional() }
BlastRadius  += { degraded: z.boolean().optional(), reason: BlastDegradedReason.optional(), indexed_sha: z.string().optional() }
export const PrHistoryReason = z.enum(['github_unavailable','github_partial']);
PrHistory    += { degraded: z.boolean().optional(), reason: PrHistoryReason.optional() }
```

**Port, both `adapters.ts` copies:**
```ts
export interface PullSummary { number: number; title: string; author: string; body: string | null; merged_at: string | null }
export interface PathCommit { sha: string; message: string; date: string | null }
GitHubClient.getPullSummary(repo: RepoRef, n: number): Promise<PullSummary>        // pulls.get, 1 call
GitHubClient.listCommitsForPath(repo: RepoRef, path: string,
  opts: { ref: string; perPage: number }): Promise<PathCommit[]>                    // repos.listCommits, 1 page
```

**Routes (module `blast`):**
- `GET /pulls/:id/blast` → 200 `BlastRadius`. Unknown or other-workspace PR → 404 `Pull request not found`; non-uuid → 422.
- `GET /pulls/:id/history` → 200 `PrHistory`; same 404/422. Route-level `rateLimit: { max: 20, timeWindow: '1 minute' }`.

**Facade internals:** `BlastCallerRow += { depth, through }`; `BlastResult += { indexedSha?, source: 'index' | 'none' }`; `ResolvedCallerRow += { declFile }`.

**Facade `getBlastRadius(repoId, changedFiles)`:**
1. `!config.repoIntelEnabled` → empty arrays, `degraded: true, reason: 'flag_off', source: 'none'`; the repository is not called.
2. `tryGetIndexState` null → `reason: 'no_data'`, `source: 'none'`.
3. status `failed`/`degraded` → empty arrays, `reason: state.degradedReason ?? 'index_failed'`, `indexedSha`, `source: 'none'`; symbols not queried.
4. `full`/`partial`: `partial` → `degraded: true, reason: 'index_partial'`; `full` → `degraded: false`, no reason. `indexedSha = state.lastIndexedSha` when non-empty; `source: 'index'`. Empty `changedFiles` → empty arrays, same degraded/reason.
5. Hop 1 as before, plus `depth: 1, through: null`; rows sorted rank desc, file asc, line asc before dedup; `MAX_CALLERS_PER_SYMBOL` applies per `viaSymbol`.
6. Hops `d = 2..BFS_DEPTH`: frontier = depth `d-1` callers whose name was found in symbol rows (not the basename fallback) and has no `.`; query `getResolvedCallers(frontierFiles, frontierNames)` keeping rows with `declFile === entry.file && toSymbol === entry.symbol`; candidate `{ file: fromPath, symbol: enclosing, viaSymbol: entry.viaSymbol, through: entry.symbol, line, rank, depth: d }`. Dropped: duplicates of a shallower `(viaSymbol, file, symbol)` and the frontier node itself. Cap `MAX_CALLERS_PER_SYMBOL` per (`viaSymbol`, `d`).
7. `getFileFacts` over the files of all hops; `callers` ordered depth asc, rank desc, file asc, line asc.
- The facade never throws and never touches `container.codeIndex` or the clone.

**Mapper `toBlastRadius` (`blast/helpers.ts`):** callers group by `viaSymbol` into `downstream[]`; a caller whose file declares a changed symbol of the same name is excluded; callers per group sorted depth asc, rank desc, file asc, line asc (`depth` always present, `through` only at depth >= 2); `endpoints_affected` / `crons_affected` are the first-appearance dedup union of `factsByFile` over the group's caller files; groups ordered by max caller rank desc, caller count desc, symbol asc; a symbol without callers has no group but stays in `changed_symbols`; `summary = "${S} symbol(s) → ${C} caller(s) · ${E} endpoint(s) · ${K} cron(s)"` (E, K unique across groups); `degraded`, `reason`, non-empty `indexed_sha` copied.

**Prior PRs (`blast/history.ts`, source GitHub commits):**
1. PR workspace-scoped (else 404); repo from `reviewRepo.getRepo` (else `NotFoundError('Repository not found')`).
2. Files sorted by (additions+deletions) desc then path asc; first `MAX_HISTORY_FILES = 20`; none → `{history: []}` with no GitHub call.
3. `container.github()` throws → `{history: [], degraded: true, reason: 'github_unavailable'}`.
4. `Promise.allSettled(listCommitsForPath(ref, path, { ref: defaultBranch, perPage: 30 }))`; all rejected → `github_unavailable`; some rejected → partial.
5. PR numbers from the FIRST message line only: `^Merge pull request #(\d+)\b` or `\(#(\d+)\)\s*$`; the current PR is excluded; per number the files and the newest date.
6. Candidates by date desc then number desc; take `MAX_HISTORY_PRS = 10`; `Promise.allSettled(getPullSummary)`; rejected → partial; `merged_at: null` → skipped.
7. Item: `pr_number`, `title`, `merged_at`, `author`, `files_overlap` (asc), `notes = notesFromBody(body)`; `history` by `merged_at` desc; partial → `degraded: true, reason: 'github_partial'`.

**Logs (one line per request):** `blast: computed` `{ prId, repoId, source, degraded, reason, indexedSha, changedFiles, symbols, callers, endpoints, crons, ms }`; `pr-history: computed` `{ prId, files, commitCalls, candidates, items, degraded, reason, ms }`; both on a child logger carrying `correlationId`.

## Acceptance criteria
- [ ] AC-1: `GET /pulls/:id/blast` → 200 parsing as `BlastRadius`; unknown uuid and other-workspace PR → 404 `Pull request not found`; `id=abc` → 422.
- [ ] AC-2: a symbol with 25 resolved hop-1 callers yields exactly 20 with `depth: 1`; a neighbour with 3 yields 3.
- [ ] AC-3: reasons follow the index state (flag off `flag_off`; no row `no_data`; `failed` `index_failed`; `partial` data + `index_partial`; `full` `degraded: false`, no reason).
- [ ] AC-4: `getBlastRadius` calls no `container.codeIndex.*` and reads no clone file in any state.
- [ ] AC-5: a caller of a caller appears in the root symbol's group with `depth: 2` and `through` = the hop-1 caller name; its endpoints land in that group's `endpoints_affected`.
- [ ] AC-6: the mapper obeys every rule above (group order, caller order, declaration-file exclusion, no-caller symbol only in `changed_symbols`, exact `summary`).
- [ ] AC-7: one `GET /pulls/:id/blast` writes exactly one `msg:"blast: computed"` stdout line with `correlationId` = request id and `source, degraded, reason, indexedSha, symbols, callers, endpoints, crons, ms`; `source:"index"` for a fully indexed repo.
- [ ] AC-8: `indexed_sha` = `repo_index_state.last_indexed_sha`; UI caller links use it (fallback `head_sha`).
- [ ] AC-9: `GET /pulls/:id/history` follows the algorithm above (limits 20 / 10, current PR excluded, unmerged skipped, `github_unavailable` / `github_partial`).
- [ ] AC-10..AC-15: client behaviour, see the client spec.
- [ ] AC-16: MCP `get_blast_radius {pr}` renders summary, `"file:line"` lines, endpoints, crons, degraded reason; description/title verbatim.
- [ ] AC-17: no change under `server/src/db/migrations`, lock files, `package.json`, `.claude`, `server/src/adapters/git`, `server/src/modules/repos/constants.ts`.
- [ ] AC-18: both `contracts/brief.ts` copies are identical; both `adapters.ts` copies changed.
- [ ] AC-19 (manual, needs a repo and PR from the user): a PR changing a shared helper shows >= 2 real callers and >= 1 HTTP endpoint; the log shows `source:"index"`.

## Test plan
- Unit (`cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`): contracts, facade with a stub repo (`repo-intel-blast.test.ts`), mapper and text helpers (`blast-helpers.test.ts`), `MockGitHubClient`.
- Integration (`scripts/checks.sh`, Docker): `blast.it.test.ts`, `pr-history.it.test.ts` via `app.inject`, Postgres and `MockGitHubClient`, including the one-line log.
- Client and MCP: see their specs. See [../../TESTING.md](../TESTING.md).
