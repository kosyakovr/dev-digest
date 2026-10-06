# Implementation Plan: Project Context — attach repo docs to agents and skills
**Status:** approved
**Spec:** specs/L05-project-context.md @ 33f11b6
**Approved:** 2026-10-06 by the user — gates: GT-1 ✓, GT-2 ✓, GT-3 ✓, GT-4 ✓ · execution mode: multi-agent · accepted: REC-1, REC-2, REC-3, REC-4
Packages: server, client, reviewer-core · Requirements: specs/L05-project-context.md · Lesson/ticket: L05

## Summary
Revised with your answers of 2026-10-06. All four gates are approved, REC-1 to REC-4 are folded into the work packages, every planner default is accepted, and the run is multi-agent.

**What gets built:**
- **WP0 (new, from REC-3):** makes the two vendored `@devdigest/shared` copies byte-identical before any contract change, so the both-copies check (`diff -r`) can pass.
- **Project Context page** at `/repos/:repoId/context`. It lists every `.md` file under the configured folders (default `docs`, `specs`) with its source and token count. The list is cached per `(repoId, clone HEAD sha)` (REC-1: I picked the cache because it is simpler than `cat-file --batch`).
- **Context tab** in the agent and skill editors, using the hybrid manual-then-grouped order. The soft-cap total now includes inherited skill docs (REC-2).
- **Run wiring:** attached docs go into `## Project context` as untrusted blocks labelled by path, with no extra LLM call and no versioning.
- **Trace:** each run records `specs_read` and `project_context`, and the Trace drawer shows them with "Remove from …" links.

**Gates, all approved:**
- **GT-1:** migration `0015`, which now includes the REC-4 partial unique indexes. The main session writes it before WP2.
- **GT-2:** the contracts, the twin re-sync and the `GitClient.listFiles` port.
- **GT-3:** the reviewer-core API change.
- **GT-4:** the new `GET /context/sources` route.

Your approval is recorded only in the `**Approved:**` line, which the main session adds when you say "plan approved".

**Execution mode — your choice needed:** multi-agent or single-agent? You chose **multi-agent**, and I recommend it too: the change spans three packages, a schema migration, both contract copies, a reviewer-core API and group E files. The split is in § Execution mode.

## Requirements review
spec-lint printed nothing. Status is `approved`. The Self-check is fully ticked, there are no `[NEEDS CLARIFICATION` markers, and A-1…A-28 are confirmed. The user accepted every default below on 2026-10-06. spec-creator folds the non-`ok` rows into the spec, and AC-16/AC-15 are reworded for R-14.

| ID | Requirement (short) | Source | Verdict | Note / default taken |
|---|---|---|---|---|
| R-1 | Sidebar WORKSPACE item "Project Context" → `/repos/<id>/context` | AC-1, NFR-7 | ok | `client/src/vendor/ui/nav.ts:21-27` has only Pull Requests. `activeKeyFor` already maps `/context` (`client/src/components/app-shell/helpers.ts:30`). |
| R-2 | `GET /repos/:id/context` returns `SpecFile[]` sorted by path, with `content` null | AC-2 | ok | Not served today (S-7). `useContextFiles` already calls it (`client/src/lib/hooks/core.ts:123`). |
| R-3 | Source folders come from config; glob `**/{f…}/**/*.md`; invalid names ignored with a warning; fall back to the defaults | AC-3, AC-55, A-1, A-21 | unclear → default accepted | The env var is `PROJECT_CONTEXT_FOLDERS`, comma-separated and trimmed. Matching is case-sensitive and only lowercase `.md` counts. The startup warning goes in `app.ts`, as at `server/src/app.ts:92`. |
| R-4 | `source` is the configured folder name nearest the repo root | AC-52, A-19 | ok | A pure helper. |
| R-5 | `tokens = ceil(chars/4)` | AC-4, AC-40, A-4 | incomplete → default accepted | Reuse `estimateTokens` (`reviewer-core/src/prompt-meta.ts:22`). A doc over 200,000 bytes, or one that cannot be read, is listed with `tokens: null` and its `size`. |
| R-6 | Uncloned repo → 422 `This repository has not been cloned yet.`; unknown repo → 404 | AC-7, Contract | ok | The wording matches `server/src/modules/conventions/service.ts:186`. The 404 message is `Repository not found`. |
| R-7 | `GET /repos/:id/context/file?path=` returns `SpecFile` with content; a path not in the list → 404, and no file is read | AC-10, AC-48, AC-49 | incomplete → default accepted | `used_by` is computed only on this route and is null on the list. A doc over the cap returns `content: null` and `tokens: null`. |
| R-8 | Page: selecting a doc shows its path, tokens and markdown; filter; badges; grouping; error, 422 and empty states | AC-5, AC-6, AC-8, AC-9, AC-46, AC-53, AC-54, A-10, A-20 | incomplete → default accepted | AC-9 needs the folder names, so a new route `GET /context/sources` returns `{ folders }` (GT-4). |
| R-9 | Raw HTML or a `<script>` in a doc is shown as text and never runs | NFR-3 | ok | `@devdigest/ui` `Markdown` (`client/src/vendor/ui/primitives/Markdown.tsx`) uses react-markdown without rehype-raw. **Assumption** (see Risks). |
| R-10 | Context tab order: manual block, then source groups, then a not-found tail; badges; "Not found in <repo>" rows | AC-11, AC-23, AC-56, AC-57, AC-69, A-22, A-26 | incomplete → default accepted | If the list request fails in a tab, the tab shows the error message and still renders the attached rows without tokens, as in AC-25. |
| R-11 | Ticking attaches with no position; unticking clears the position | AC-12, AC-66, A-25 | ok | |
| R-12 | Drop and Move rules, renumbering, no handle on unattached rows, Move buttons labelled with `aria-label` | AC-13, AC-62–AC-65, AC-67, AC-68, NFR-4, A-23, A-24 | ok | The rules are in WP8 step 2. |
| R-13 | A non-empty filter disables drag and Move and shows a hint | AC-14 | ok | Same as `SkillsTab.tsx:48-49,93`. |
| R-14 | Per-row tokens, "≈ <total> tokens", and an "over 4K soft cap" badge with text | AC-15, AC-16, NFR-5, A-16 | unclear → default accepted (REC-2) | **The total, and the cap check against it, = the tokens of the editor's own attached docs found in the repo list + the tokens of inherited paths that are not also attached directly.** For a skill tab there is nothing inherited, so the total is its own docs. spec-creator rewords AC-15/AC-16 to match. |
| R-15 | Preview drawer: path, tokens, rendered text, Attach toggle, `source` badge, "Used by" | AC-17, AC-49, AC-59 | ok | |
| R-16 | Save sends one PUT with every attached path and its position or null, then shows a toast. A failed save keeps the draft and shows an error toast. | AC-18, A-6 | ok | The same pattern as `SkillsTab.tsx:58-63`. |
| R-17 | PUT semantics: round trip, collapse repeats, renumber gaps, reject a bad path or position (422, nothing stored), response order | AC-19, AC-21, AC-22, AC-60, AC-61, A-8, A-12, A-27, Contract | unclear → default accepted | Repeated paths are collapsed first (the first wins), then repeated positions are rejected, then the positions are renumbered. `[a:0, a:0]` → 200, stored once. |
| R-18 | Saving leaves `version` and the version history unchanged | AC-20 | ok | Separate tables. Versioning in `agents.update` is untouched (`server/src/modules/agents/repository.ts:121-155`). |
| R-19 | Only paths are stored, no doc text | AC-47 | ok (inspection) | The GT-1 DDL has no text column besides `path`. |
| R-20 | Agent tab shows "Inherited from skills: <n> documents · ≈ <t> tokens" | AC-24, A-5 | unclear → default accepted | n = the distinct paths across inherited skills, counting only skills enabled on the agent and enabled globally. t = the sum of their tokens in the active repo list. |
| R-21 | No repo connected → attached paths without tokens, plus a hint to add a repo | AC-25, A-9 | ok | |
| R-22 | Skill Context tab after Config, with the same behaviour plus the inheritance note | AC-26, AC-27, AC-58 | ok | |
| R-23 | A run reads each path from the clone's HEAD in A-5 order | AC-28, A-3, A-5, A-11, A-15 | incomplete → default accepted | If the repo has no clone, or HEAD cannot be resolved, every attached path is recorded `skipped/not_found`. |
| R-24 | One `## Project context` section with one `<untrusted source="<path>">` per doc; the label is stripped of `"<>`; escaping and the guard are unchanged | AC-29, AC-30, AC-42, AC-43 | ok | The slot exists at `reviewer-core/src/prompt.ts:156-159,213-219`. Today's label is `spec-<i>`. |
| R-25 | Skip not_found / too_large / unreadable and let the run go on; read only the stored paths; no run-time token budget | AC-31, AC-32, AC-33, AC-34, A-7, A-16 | incomplete → default accepted | `readFileAtRef` returning null means `not_found`. A decoded UTF-8 byte length different from `bytes`, or a thrown read, means `unreadable`. Skipped entries carry `tokens: 0`. |
| R-26 | Trace `specs_read` = the included paths in prompt order; `project_context` has one entry per attached path | AC-35, AC-36, AC-40 | ok | Today `specs_read: []` (`server/src/modules/reviews/run-executor.ts:355`). `tokens` = `estimateTokens(raw doc text)`. `text` = the exact wrapped block. |
| R-27 | Trace UI: Specs read rows, Prompt assembly entries that open their full text, Remove links | AC-37, AC-38, AC-39, AC-44, AC-50, AC-51, NFR-7, A-18 | incomplete → default accepted | The PR page passes `agent_id` from `ReviewRecord` (`client/src/vendor/shared/contracts/review-api.ts:26`) into the drawer. A null id shows no agent link. |
| R-28 | Skill bodies keep their order in `## Skills / rules` | AC-45 | ok | `run-executor.ts:225-231` is unchanged. |
| R-29 | List, file and PUT make 0 LLM and 0 GitHub calls | NFR-1, NFR-2 | ok | |
| R-30 | A run with docs makes the same number of LLM calls as without | NFR-8 | ok | The docs travel in `promptParts` (`reviewer-core/src/review/run.ts:158`). |
| R-31 | Run log: one summary line, plus one line per skipped doc | NFR-6, A-14 | unclear → default accepted | `<reason>` is the stored code. No line is written when there are no attachments. |
| R-32 | With no attachments, or all skipped, the prompt is byte-identical to today's | AC-41 | ok | `specs` is omitted when empty, as `skills` is (`run-executor.ts:247`). |
| R-33 | Deleting an agent or skill removes its attachments | spec § Other edge cases | ok | FK `on delete cascade` (GT-1). |
| R-34 | A doc attached directly and also inherited is included once; detaching a skill drops its docs from the next run | A-5 | ok | |
| R-35 | The "Used by <n> agents" count | AC-48, A-17 | unclear → default accepted | Counts every workspace agent whatever its `agents.enabled`, that attaches the path directly or through a skill enabled on the agent and enabled globally. |
| R-36 | The list route must not re-read every doc on every call (REC-1, accepted) | user 2026-10-06 | ok | A cache per `(repoId, head sha)` in the route-held `ContextService`, invalidated when the HEAD changes (WP5). |
| R-37 | The vendored twins are byte-identical, so the both-copies check passes (REC-3, accepted) | user 2026-10-06, AGENTS.md § Cross-package invariants | ok | WP0. Today 5 files differ: `adapters.ts`, `contracts/eval-ci.ts`, `contracts/knowledge.ts`, `contracts/productionize.ts`, `contracts/trace.ts`. |
| R-38 | The DB guarantees no repeated manual position per owner (REC-4, accepted) | user 2026-10-06, A-27 | ok | Partial unique indexes in `0015` (GT-1). |

## Goal
Users browse a repo's markdown docs with their token sizes, attach them in a set order to agents and skills, and get them added as untrusted, path-labelled blocks to every run's prompt. Each run's Trace shows what was read, what was skipped, and the exact text that was added.

## Non-goals
- No creating, editing, uploading or deleting docs. No re-index, coverage, chunks or embeddings: `POST /repos/:id/context/reindex` stays unserved, and `useReindexContext` stays as an unserved hook.
- No versioning of attachments or of doc contents. Agent and skill `version` are unchanged.
- No path list inside a skill body. `insights/` is not a default source. No `g`+letter shortcut. No LLM call for discovery, counting or attaching. No changes to MCP, the CI runner, multi-agent views, detectors or e2e flows.
- No "reset order" control.
- WP0 copies the server versions of the five drifted shared files into the client unchanged. It adds no new contract and changes no server copy.

## What already exists (do not rebuild)
- `wrapUntrusted`, which escapes `</untrusted>` — `reviewer-core/src/prompt.ts:31-35`. The `## Project context` slot, omitted when empty — `:156-159`, `:213-219`.
- `PromptParts.specs` / `ReviewInput.specs: string[]` — `reviewer-core/src/prompt.ts:101`, `reviewer-core/src/review/run.ts:77,158`. Exports — `reviewer-core/src/index.ts:15-33`.
- `estimateTokens` = `ceil(chars/4)` — `reviewer-core/src/prompt-meta.ts:22`.
- `readFileAtRef` (reads git objects, path guard, size cap) — `server/src/adapters/git/simple-git.ts:141-166`. `currentHead` — `:93-95`.
- `MockGitClient`, with `filesAtRef`, `readsAtRef`, and `sync()` moving HEAD to `syncedHead` — `server/src/adapters/mocks.ts:296-357`. The `MockPrIntent` facade double — `:373`.
- `SpecFile` contract, not served by any route — `{server,client}/src/vendor/shared/contracts/platform.ts:309-315`. `RunTrace.specs_read` — `server/.../trace.ts:89`, `client/.../trace.ts:88`.
- The clone-missing check and message — `server/src/modules/conventions/service.ts:183-189`.
- Skill link order and the enabled filter — `server/src/modules/agents/repository.ts:201-209`, `server/src/modules/reviews/run-executor.ts:225-231`.
- Delete-then-insert of an ordered set inside a transaction — `server/src/modules/agents/repository.ts:247-255`.
- The container facade pattern (getter, override, mock) — `server/src/platform/container.ts:61,88,135`.
- `IdParams` (non-uuid → 422) — `server/src/modules/_shared/schemas.ts:11`. `NotFoundError` and `ValidationError` — `server/src/platform/errors.ts:19-29`. The startup-warning precedent — `server/src/app.ts:92`.
- Client:
  - `useContextFiles` — `client/src/lib/hooks/core.ts:123`. `api.put` — `client/src/lib/api.ts`.
  - The `shell.nav.context` label — `client/messages/en/shell.json:20`. `context.json` with `title` and `loadError` "Couldn’t load specs" — `client/messages/en/context.json`.
  - The drag and Move up/down pattern, driven by state with no `dataTransfer` — `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:65-71,105-166`.
  - Editor tab registries — `.../AgentEditor/constants.ts` and `.../SkillEditor/constants.ts` (`TABS`).
  - The Trace "Specs read" row — `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:39-50`. The `PromptBlock` collapsible with fullscreen — `.../PromptBlock/PromptBlock.tsx:23`.
  - `useActiveRepo` and `useRepoNotFound` — `client/src/lib/repo-context.tsx`. `RepoNotFound` — `client/src/components/repo-not-found`. `Markdown` and `Drawer` — `@devdigest/ui`.

## Contract
**Vendored twins (GT-2, WP0).** Before WP1, `client/src/vendor/shared/{adapters.ts, contracts/eval-ci.ts, contracts/knowledge.ts, contracts/productionize.ts, contracts/trace.ts}` become byte copies of their `server/` twins. This is additive or widening for the client:
- `LLMRequest.sessionId?`
- `id` gains `'openrouter'`
- `CommitFile`, `CommitFilesPayload`, `commitFiles` and `findOpenPr` on the GitHub port
- `sync` and `diffNameOnly` on `GitClient`
- `AgentManifest`
- the `provider` enums gain `'openrouter'`
- `AgentVersionConfig` and `AgentVersion`
- comment-only edits

From this point on, `diff -r server/src/vendor/shared client/src/vendor/shared` prints nothing, and every later WP keeps it that way.

**Shared contracts (GT-2, WP1).** Identical in both copies.

`contracts/platform.ts`, in the Project Context block:
```ts
SpecFile += { tokens: z.number().int().nullish(), source: z.string().nullish(), used_by: z.number().int().nullish() }
export const ContextItem = z.object({ path: z.string().min(1), position: z.number().int().nonnegative().nullable() });
export const ContextPaths = z.object({ items: z.array(ContextItem) });
export const AgentContext = z.object({
  items: z.array(ContextItem),
  inherited: z.array(z.object({ skill_id: z.string(), skill_name: z.string(), items: z.array(ContextItem) })),
});
export const ContextSources = z.object({ folders: z.array(z.string()) });   // GT-4
// + `export type X = z.infer<typeof X>` for each
```

`contracts/trace.ts`:
```ts
export const ProjectContextEntry = z.object({
  path: z.string(), tokens: z.number().int(),
  status: z.enum(['included', 'skipped']),
  reason: z.enum(['not_found', 'too_large', 'unreadable']).optional(),
  via_skill: z.object({ id: z.string(), name: z.string() }).nullable(),
  text: z.string().nullable(),
});
RunTrace += { project_context: z.array(ProjectContextEntry).optional() }
```

In `adapters.ts` (WP4, both copies), `GitClient` gains `listFiles(repo: RepoRef, ref: string): Promise<string[]>`. It returns the repo-relative paths of every blob in the tree at the hex commit `ref`, and throws on a non-hex ref.

**reviewer-core (GT-3).** Exported from `src/index.ts`:
```ts
export interface ProjectDoc { source: string; text: string }
PromptParts.specs?: (string | ProjectDoc)[]     // string keeps label `spec-<i>`; ReviewInput.specs same type
export function sanitizeSourceLabel(label: string): string        // removes every " < >
export function renderProjectContextBlock(doc: ProjectDoc): string // = wrapUntrusted(sanitizeSourceLabel(doc.source), doc.text)
```

**Routes.** All are workspace-scoped. A non-uuid `:id` returns 422. Errors use the existing envelope.

| Route | 200 body | Errors |
|---|---|---|
| `GET /context/sources` | `ContextSources` | — |
| `GET /repos/:id/context` | `SpecFile[]` (path ascending; `content`, `used_by` and `updated_at` are null) | 404 `Repository not found`; 422 `This repository has not been cloned yet.` |
| `GET /repos/:id/context/file?path=<p>` | `SpecFile` with `content`, `tokens`, `source`, `size` and `used_by` | as above, plus 404 `Document not found` when `p` is not in the list; missing `path` → 422 |
| `GET /agents/:id/context` · `PUT` with body `ContextPaths` | `AgentContext` | 404 `Agent not found`; 422 for a bad path or position |
| `GET /skills/:id/context` · `PUT` with body `ContextPaths` | `ContextPaths` | 404 `Skill not found`; 422 as above |

Every `items` list in a response is ordered with positioned items first, by position ascending, then the null ones by path ascending.

**DB (GT-1).** Migration `0015_add_context_docs`, hand-written by the main session:
```sql
CREATE TABLE agent_context_docs (agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE, path text NOT NULL, position integer,
  CONSTRAINT agent_context_docs_agent_id_path_pk PRIMARY KEY (agent_id, path),
  CONSTRAINT agent_context_docs_position_check CHECK (position IS NULL OR position >= 0));
CREATE UNIQUE INDEX agent_context_docs_agent_position_uq ON agent_context_docs (agent_id, position) WHERE position IS NOT NULL;
CREATE TABLE skill_context_docs (skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE, path text NOT NULL, position integer,
  CONSTRAINT skill_context_docs_skill_id_path_pk PRIMARY KEY (skill_id, path),
  CONSTRAINT skill_context_docs_position_check CHECK (position IS NULL OR position >= 0));
CREATE UNIQUE INDEX skill_context_docs_skill_position_uq ON skill_context_docs (skill_id, position) WHERE position IS NOT NULL;
```

**Server facade** (`server/src/modules/context/types.ts`):
```ts
export interface ProjectContextFacade {
  /** Never throws; reads the attachment lists once (A-11). */
  resolveForRun(a: { agentId: string; repo: RepoRef; cloned: boolean }):
    Promise<{ docs: ProjectDoc[]; entries: ProjectContextEntry[] }>;   // docs = included, in A-5 order
}
```

**Config.** `AppConfig.contextFolders: string[]` (default `['docs','specs']`) and `AppConfig.contextFoldersIgnored: string[]`, both from the env var `PROJECT_CONTEXT_FOLDERS`.

**Client seams**, fixed so that T1 can be written first:
- The page is `client/src/app/repos/[repoId]/context/page.tsx`, default export.
- The agent tab is `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` → `ContextTab({ agent }: { agent: Agent })`, shown for `?tab=context`. `AgentEditor` `TABS` becomes config, skills, context.
- The skill tab is `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/ContextTab.tsx` → `ContextTab({ skill }: { skill: Skill })`. `SkillEditor` `TABS` becomes config, context, preview, versions.
- The shared editor is `client/src/components/context-docs/ContextDocsEditor/ContextDocsEditor.tsx` → `ContextDocsEditor({ items, inherited?, note?, saving, onSave })`.
- `TraceBody({ trace, findings, agentId? })` and `RunTraceDrawer` gain an optional `agentId?: string | null`.
- Hooks come from `@/lib/hooks/context`, and the active repo from `@/lib/repo-context` (`useActiveRepo`).
- Tests mock `fetch` by URL: `/context/sources`, `/repos/<id>/context`, `/repos/<id>/context/file?path=<encodeURIComponent(p)>`, `GET|PUT /agents/<id>/context` and `GET|PUT /skills/<id>/context`.
- Each document row is `role="listitem"` with `aria-label` set to its path.
- The attach control is a checkbox named `Attach <path>`.
- The move buttons are `Move <path> up` and `Move <path> down`.
- Each source group heading is `role="heading"` whose text is the source name.
- The drag source and drop target are the `listitem` itself, through `onDragStart`, `onDragOver` and `onDrop`.

**UI strings (English, exact).**

`context.json`:
- `empty.title` "No documents found"
- `empty.body` "No .md files under {folders}. Add documents there, then resync the repository."
- `filterPlaceholder` "Filter documents…"
- `tokens` "≈ {count, number} tokens"
- `usedBy` "Used by {count, plural, one {# agent} other {# agents}}"
- `editor.total` "≈ {count, number} tokens"
- `editor.softCap` "over 4K soft cap"
- `editor.notFound` "Not found in {repo}"
- `editor.inherited` "Inherited from skills: {count} documents · ≈ {tokens, number} tokens"
- `editor.noRepo` "Add a repository to see its documents and token counts."
- `editor.reorderLocked` "Clear the filter to reorder."
- `editor.attach` "Attach {path}"
- `editor.moveUp` "Move {path} up"
- `editor.moveDown` "Move {path} down"
- `editor.preview` "Preview"
- `editor.attachAction` "Attach"
- `editor.attached` "Attached"
- `editor.save` "Save"
- `editor.saving` "Saving…"
- `editor.savedToast` "Context saved"
- `editor.saveError` "Couldn’t save context"
- `editor.skillNote` "Any agent using this skill inherits these documents."

`agents.json` and `skills.json`:
- `editor.tabs.context` "Context"

`runs.json`:
- `trace.prompt.specs` becomes "Project context — attached specs (untrusted)"
- `trace.config.specTokens` "≈ {count, number} tokens"
- `trace.config.skipped.not_found` "skipped — not found"
- `trace.config.skipped.too_large` "skipped — too large"
- `trace.config.skipped.unreadable` "skipped — unreadable"
- `trace.config.removeFromAgent` "Remove from agent"
- `trace.config.removeFromSkill` "Remove from skill {name}"

## Decisions taken
| Decision | Why | Rejected alternative |
|---|---|---|
| Find docs with `git ls-tree` at the clone's HEAD (`listFiles`) and read them with `readFileAtRef` at that sha | The object DB cannot be escaped through the file system (`simple-git.ts:137-148`). The list and the run read the same checkout (A-2, A-3, AC-40). The existing mock already serves both. | An `fs` walk of the working tree, as in `repo-intel/pipeline/walk.ts`: disk I/O outside an adapter (onion §5) and a guard of its own. |
| REC-1: cache the `SpecFile[]` list per repo, keyed by HEAD sha, in the `ContextService` that `context/routes.ts` builds once per app | One `Map<repoId, {head, docs}>`. A resync moves HEAD, so the next call misses. Each call costs one `rev-parse HEAD` instead of 2N `git` calls. No port change. | `git cat-file --batch`: a new port method, binary-safe stream parsing, and a mock. It also still re-reads on every call. |
| Two link tables with FK cascade, plus partial unique indexes on `(owner, position) WHERE position IS NOT NULL` (REC-4) | Mirrors `agent_skills` (`server/src/db/schema/agents.ts:51-67`). Cascade gives R-33. The DB enforces A-27. A transactional delete-then-insert never collides with the index. | A `jsonb` column on `agents` / `skills`; a check in the service only. |
| A new `modules/context/` exposed as a `ProjectContextFacade` on `Container` and used by `run-executor` | Onion §4: no import from another module's folder. Follows `container.intent` (`container.ts:135`). | Importing `../context/service.js` from `reviews/`. |
| reviewer-core `specs` becomes `(string \| ProjectDoc)[]`, plus `renderProjectContextBlock` | Keeps the exports and the `spec-<i>` callers stable (reviewer-core/AGENTS.md). The server builds `trace.text` with the same function, so the two cannot drift. | Objects only (a breaking change), or wrapping again in the server. |
| `MAX_CONTEXT_DOC_BYTES = 200_000` in `context/constants.ts` | The A-7 value, without a sideways import (onion §11: do not copy that exception). | Importing `MAX_SPEC_BYTES`. |
| REC-3: copy the five drifted shared files server → client in WP0, before any contract change | The server copies are supersets: every difference is additive or a widened enum, and the client already uses `"openrouter"` (`SettingsApiKeys/constants.ts:14`). | Hand-merging each drift, or leaving the drift in place. |
| One shared `ContextDocsEditor` in `client/src/components/context-docs/` | Two routes use it (frontend-ui-architecture §2). | Two copies. |
| Move `useContextFiles` from `core.ts` into `lib/hooks/context.ts`, keeping its name and key | One import specifier for all context hooks. The barrel still exports it. | Leaving it in `core.ts`. |
| REC-2: the soft-cap total includes inherited paths that are not attached directly | That is what the prompt adds (A-5). Skill tabs have nothing inherited. | Counting only the editor's own docs. |
| `GET /context/sources` (GT-4) | AC-9 must name the configured folders. | Hard-coding "docs, specs" in the i18n file. |

## Gates — need user approval before implementation
All four were approved by the user on 2026-10-06. The main session records this in the `**Approved:**` line after "plan approved", and the implementer reads gate status from that line.
- [ ] **GT-1: DB schema and migration.** The DDL in § Contract: two tables plus the REC-4 partial unique indexes. Per `docs/hand-written-migrations.md` § With the implementer agent, the **main session** writes `server/src/db/migrations/0015_add_context_docs.sql`, `meta/0015_snapshot.json` (including both `uniqueIndex` entries with their `where`) and the `meta/_journal.json` entry before WP2. The implementer edits only `server/src/db/schema/*.ts` (WP2).
- [ ] **GT-2: shared contracts and the `GitClient` port, in both vendored copies.** This covers the WP0 twin re-sync (server → client, five files), the additive WP1 contracts and the WP4 `listFiles`.
- [ ] **GT-3: reviewer-core public API**, additive (`ProjectDoc`, `sanitizeSourceLabel`, `renderProjectContextBlock`, a widened `specs`). It triggers server-unit CI.
- [ ] **GT-4: the new route `GET /context/sources` and the `ContextSources` contract**, which the spec does not name.

No dependency, lock-file, `package.json` or `.claude/` change. Nothing is removed from a route, field or column.

## Work packages

### WP0 — Re-sync the vendored `@devdigest/shared` twins   [client · groups B, C]
- **Implements:** R-37
- **Files:** modify `client/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/productionize.ts`, `client/src/vendor/shared/contracts/trace.ts`
- **Skills the implementer must apply:** zod (§6 Schema Composition, since `eval-ci.ts` imports `Provider` and `CiFailOn` from `knowledge.ts`); onion-architecture §8 (vendored twice); frontend-ui-architecture §9 (one contract, imported by both sides).
- **Constraints:** contract-only. No `server/` file changes, and no client file outside `src/vendor/shared/` changes. If the client typecheck fails because of the widened types (e.g. `'openrouter'`), **stop and report it**; do not edit app code to fit.
- **Steps:** 1. Replace each of the five client files with the content of its server twin, byte for byte.
- **Done when:**
  - `diff -r server/src/vendor/shared client/src/vendor/shared` prints nothing.
  - `cd client && pnpm typecheck && pnpm test` exits 0.
  - `git diff --stat -- server/` is empty.
- **Tests:** see Test brief WP0.tests

### WP1 — Shared contracts, both copies   [server + client · groups B, C, E]
- **Implements:** R-2, R-7, R-8 (`ContextSources`), R-17, R-26 (shapes)
- **Files:** modify `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts`, `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts`
- **Skills the implementer must apply:** zod (§1 Schema Definition, §3 Type Inference, §5 Object Schemas); onion-architecture §8 (vendored twice, `z.infer`, snake_case DTOs); frontend-ui-architecture §9. Group E: `server/src/vendor/shared/**`.
- **Constraints:**
  - Root AGENTS.md § Cross-package invariants applies.
  - Every change is additive, and every new field is optional or nullish, so stored traces still parse (AC-44).
  - Starts after WP0.
- **Steps:**
  1. Add the fields and schemas from § Contract next to `SpecFile` in `platform.ts` (`:309`), in both copies.
  2. Add `ProjectContextEntry` and `RunTrace.project_context` to `trace.ts`, in both copies.
  3. Export the `z.infer` types.
- **Done when:** `diff -r server/src/vendor/shared client/src/vendor/shared` prints nothing, and `cd server && pnpm typecheck` and `cd client && pnpm typecheck` both exit 0.
- **Tests:** see Test brief WP1.tests

### WP2 — Drizzle tables matching GT-1   [server · group B]
- **Implements:** R-19, R-33, R-38
- **Files:** modify `server/src/db/schema/agents.ts` (`agentContextDocs`), `server/src/db/schema/skills.ts` (`skillContextDocs`), `server/src/db/schema.ts` (import both and add them to the `schema` object, `:33-34`, `:52+`)
- **Skills the implementer must apply:** postgresql-table-design (§ Core Rules, § Constraints, § Indexing); drizzle-orm-patterns (§ Best Practices)
- **Constraints:** only after GT-1 is approved and the main session has written `0015`. Never touch `server/src/db/migrations/**` (root AGENTS.md). Names, types, PK, CHECK and index names must equal the `.sql` exactly.
- **Steps:**
  1. Define both tables:
     - `primaryKey({ name: '<table>_<owner>_path_pk', columns: [owner, path] })`
     - a nullable `integer('position')`
     - `check('<table>_position_check', sql\`position IS NULL OR position >= 0\`)`
     - `uniqueIndex('<table>_<owner>_position_uq').on(owner, t.position).where(sql\`position IS NOT NULL\`)`
  2. Register both tables in `schema.ts`.
- **Done when:** `cd server && pnpm typecheck` exits 0, and `pnpm exec vitest run .it.test` migrates without error.
- **Tests:** see Test brief WP2.tests

### WP3 — reviewer-core: path-labelled Project context blocks   [reviewer-core · group F]
- **Implements:** R-24, R-30, R-32
- **Files:** modify `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts` (the `specs` type at `:77`), `reviewer-core/src/index.ts`
- **Skills the implementer must apply:** `docs/agent-prompts/general-reviewer.md` (the group F checklist); `docs/agent-prompts/README.md` § User message (section order unchanged)
- **Constraints:** reviewer-core/AGENTS.md: no FS, DB or GitHub access; keep the `src/index.ts` exports stable; run the server typecheck and tests afterwards. An empty or absent `specs` must stay byte-identical (AC-41, `prompt-golden.test.ts`).
- **Steps:**
  1. Add `ProjectDoc`, `sanitizeSourceLabel` (removes every `"`, `<` and `>`) and `renderProjectContextBlock`.
  2. In `specsBlock` (`prompt.ts:156-159`), wrap a string as `wrapUntrusted(\`spec-${i}\`, s)` and an object as `renderProjectContextBlock(s)`, still joined with `'\n\n'`.
  3. Widen `PromptParts.specs` and `ReviewInput.specs`, and export the new names.
- **Done when:** `cd reviewer-core && npm test && npm run typecheck` exits 0, `cd server && pnpm typecheck` exits 0, and its `[T1]` tests pass.
- **Tests:** see Test brief WP3.tests

### WP4 — `GitClient.listFiles` and the folder setting   [server + client · groups A, B, C, E]
- **Implements:** R-3, R-2 (port)
- **Files:** modify `server/src/vendor/shared/adapters.ts` and `client/src/vendor/shared/adapters.ts` (`GitClient`), `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts` (`MockGitClient`), `server/src/platform/config.ts`, `server/src/app.ts`
- **Skills the implementer must apply:** onion-architecture §5 (port, real adapter and an `implements` double land together), §3 (env config lives in `platform/config.ts`), §6 (`app.ts` order); fastify-best-practices (§ Core Principles); zod (§2 Parsing & Validation); frontend-ui-architecture §9. Group E: `config.ts`, `app.ts`, `vendor/shared`.
- **Constraints:** `process.env` only in `config.ts` (onion §10). Use the hex-ref guard as in `simple-git.ts:147`. Both `adapters.ts` copies get the identical member and doc comment.
- **Steps:**
  1. Add `listFiles(repo, ref)` to the port in both copies.
  2. `SimpleGitClient.listFiles`: reject a non-`HEX_REF` ref, run `git ls-tree -r --name-only -z <ref>`, split on `\0` and drop empty entries.
  3. `MockGitClient.listFiles(_repo, ref)`: return the `filesAtRef` keys starting with `${ref}:`, with that prefix stripped.
  4. `config.ts`: `PROJECT_CONTEXT_FOLDERS: z.string().optional()`. Split on `,` and trim. A name is invalid if it is empty or contains `/`, `*`, `?`, `{`, `}`, `,` or `..`. If no valid name remains, use `['docs','specs']`. Expose `contextFolders` and `contextFoldersIgnored`.
  5. `app.ts`: log one `app.log.warn` per ignored name, after `:92`.
- **Done when:** `diff -r server/src/vendor/shared client/src/vendor/shared` prints nothing, `cd server && pnpm typecheck` exits 0, and `cd server && pnpm exec vitest run test/config.test.ts test/adapters.test.ts` exits 0.
- **Tests:** see Test brief WP4.tests

### WP5 — `modules/context`: routes, service with list cache, repository, facade   [server · groups A, B, E]
- **Implements:** R-2, R-4, R-5, R-6, R-7, R-8 (sources route), R-17, R-18, R-20 (server), R-29, R-33, R-35, R-36
- **Files:**
  - create `server/src/modules/context/routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`, `types.ts`
  - modify `server/src/modules/index.ts` (register `context`), `server/src/platform/container.ts` (`reposRepo` getter, `projectContext` getter, and `ContainerOverrides.projectContext`), `server/src/adapters/mocks.ts` (`MockProjectContext implements ProjectContextFacade`)
- **Skills the implementer must apply:**
  - onion-architecture: §2 (module anatomy, file docblocks, registration), §4 (agents, skills and repos repositories only through `container.*`), §5 (facade + override + double), §6 (schema-validated routes, throw `AppError`s, `getContext`), §7 (Drizzle only in `repository.ts`, workspace-scoped queries, hand-written mappers), §8
  - fastify-best-practices (§ Core Principles)
  - drizzle-orm-patterns (§ Best Practices: transactions)
  - zod (§7 Refinements & Transforms)
  - Group E: `routes.ts`, `container.ts`.
- **Constraints:**
  - server/AGENTS.md: a new module is `src/modules/<name>/` plus its registration.
  - server/INSIGHTS.md 2026-09-22: check tenancy with `agentsRepo.getById(workspaceId, id)` and `skillsRepo.getById(workspaceId, id)` before every read and write.
  - No `container.llm()` or `container.github()` call (NFR-1, NFR-2).
- **Steps:**
  1. Pure functions in `helpers.ts`:
     - `sourceOf(path, folders)`: the first directory segment from the left that equals a folder name, else null.
     - `isDocPath(path, folders)`: true when the path ends in `.md` and `sourceOf` is not null.
     - `isValidAttachmentPath(p)`: non-empty, does not start with `/` or `-`, has no `..` segment, ends in `.md`.
     - `normalizeItems(items)`: drop repeated paths (the first wins). Then, if two positions are equal, return `{ error: 'duplicate_position' }`. Otherwise renumber the positioned items 0..n-1 in ascending order.
     - `sortForResponse(items)`: the A-27 order.
     - `runOrder(items, folders)`: positioned items by position ascending; then null-position items by source name ascending and path ascending; then items with no source, by path ascending (A-5).
     - `classifyRead(read, max)`: null → `not_found`; `bytes > max` → `too_large`; `Buffer.byteLength(text) !== bytes` → `unreadable`; otherwise `ok`.
     - `toSpecFile(…)`: a hand-written mapper.
  2. `constants.ts`: `MAX_CONTEXT_DOC_BYTES = 200_000` (A-7, equal to intent's `MAX_SPEC_BYTES`).
  3. `repository.ts` (`ContextDocsRepository`, class style):
     - `itemsForAgent(agentId)` and `itemsForSkill(skillId)`.
     - `replaceAgentItems(agentId, items)` and `replaceSkillItems(skillId, items)`: delete then insert in one transaction, as in `agents/repository.ts:247-255`.
     - `inheritedForAgent(workspaceId, agentId)`: skills whose link is enabled, that are enabled globally and belong to the workspace, and have at least one item, in `agent_skills.order`.
     - `countAgentsUsing(workspaceId, path)` (R-35).
  4. `service.ts` (`ContextService implements ProjectContextFacade`):
     - **`sources()`**.
     - **`listDocs(ws, repoId)`:**
       1. `reposRepo.getById` → 404 if missing; no `clonePath` → 422.
       2. `head = git.currentHead`.
       3. **Cache (REC-1):** a private `Map<string, { head: string; docs: SpecFile[] }>` keyed by `repoId`. If the entry's `head` equals the current one, return a copy of `docs`.
       4. Otherwise: `listFiles(head)` filtered with `isDocPath` and sorted; for each path, `readFileAtRef(head, path, MAX)`; `tokens` via `estimateTokens` (from `@devdigest/reviewer-core`) only when the read is `ok`. Store `{ head, docs }`.
     - **`getDoc(ws, repoId, path)`:** check membership against `listDocs` before any read → 404. Then read the one file and fill `used_by`.
     - **`get` / `setAgentContext` and `get` / `setSkillContext`:** an error from `normalizeItems` → `ValidationError` (422) before any write. Never call `agentsRepo.update` or `skillsRepo.update`.
     - **`resolveForRun`:**
       - Order: the agent's own items in `runOrder`, then each inherited skill's items in `runOrder`, skipping paths already seen.
       - If `!cloned`, or `currentHead` throws, every path is `not_found`. Otherwise read and classify each path.
       - An included doc becomes `ProjectDoc { source: path, text }`.
       - Each entry: `tokens` = `estimateTokens(text)`, or 0 when skipped; `via_skill`; `text` = `renderProjectContextBlock(doc)`, or null when skipped.
       - It never throws.
       - It does not use the list cache.
  5. `routes.ts`:
     - Build **one** `ContextService` per plugin registration (that instance holds the cache).
     - Register the six routes from § Contract, validating with `IdParams`, querystring `z.object({ path: z.string().min(1) })`, and a body from `ContextPaths` whose `path` is refined with `isValidAttachmentPath` (→ 422).
     - Not-found cases throw `NotFoundError('Agent not found' | 'Skill not found' | 'Repository not found' | 'Document not found')`.
  6. `container.ts`:
     - `get reposRepo()` → `new RepoRepository(this.db)`.
     - `get projectContext()`: the override first, else `new ContextService(this)`.
     - Add `ContainerOverrides.projectContext?: ProjectContextFacade`.
- **Done when:**
  - `cd server && pnpm typecheck` exits 0.
  - `grep -rn "drizzle-orm\|db/schema\|fastify" server/src/modules/context/service.ts` prints nothing.
  - `grep -n "context" server/src/modules/index.ts` shows the import and the entry.
  - Its `[T1]` tests pass.
- **Tests:** see Test brief WP5.tests

### WP6 — Run executor wiring   [server · group A]
- **Implements:** R-23, R-25, R-26, R-28, R-30, R-31, R-32, R-34
- **Files:** modify `server/src/modules/reviews/run-executor.ts`
- **Skills the implementer must apply:** onion-architecture §4 (only through `this.container.projectContext`), §3 (the long-running step stays in `run-executor.ts`)
- **Constraints:**
  - The `## Skills / rules` block stays unchanged (`:225-231`, AC-45).
  - Omit `specs` when it is empty, as at `:247` (AC-41).
  - No extra LLM call (NFR-8).
  - `traceFromBuffer` (`:486-510`) stays unchanged.
- **Steps:**
  1. After the skills block, call `resolveForRun({ agentId: agent.id, repo: { owner: repo.owner, name: repo.name }, cloned: repo.clonePath != null })`.
  2. If there are entries, `runLog.info` the line `Project context: <i> document(s) included (≈ <t> tokens), <k> skipped`, plus `Project context: skipped <path> — <reason>` for each skipped entry.
  3. Pass `...(docs.length > 0 ? { specs: docs } : {})` to `reviewPullRequest`.
  4. In the success trace, set `specs_read` to the included paths in prompt order, and add `project_context: entries` only when `entries.length > 0`.
- **Done when:** `cd server && pnpm typecheck` exits 0, and its `[T1]` tests pass.
- **Tests:** see Test brief WP6.tests

### WP7 — Client data layer   [client · groups C, D]
- **Implements:** R-2, R-7, R-8, R-16, R-17, R-20 (data access)
- **Files:** create `client/src/lib/hooks/context.ts` · modify `client/src/lib/hooks/core.ts` (move `useContextFiles` and `useReindexContext` out of it unchanged), `client/src/lib/hooks/index.ts` (`export * from "./context"`)
- **Skills the implementer must apply:** frontend-ui-architecture §7 (tier 3), §8 (server data stays in the query cache); react-best-practices (§ Data Fetching)
- **Constraints:** client/AGENTS.md: data goes through `lib/hooks` → `lib/api.ts` only.
- **Steps:**
  1. `useContextSources()`, key `["context-sources"]`.
  2. `useContextFiles(repoId)`, key `["context", repoId]`.
  3. `useContextFile(repoId, path)`, key `["context-file", repoId, path]`, enabled only when both are set.
  4. `useAgentContext(agentId)` (`["agent-context", id]`) and `useSetAgentContext()`, which PUTs `{ items }` and then calls `setQueryData`.
  5. `useSkillContext` and `useSetSkillContext`, the same with `["skill-context", id]`.
- **Done when:** `cd client && pnpm typecheck` exits 0, and `grep -rn "useContextFiles" client/src/lib/hooks/core.ts` prints nothing.
- **Tests:** see Test brief WP7.tests

### WP8 — Context tabs (shared editor, agent tab, skill tab)   [client · groups C, D, F]
- **Implements:** R-9 (drawer), R-10, R-11, R-12, R-13, R-14, R-15, R-16, R-20, R-21, R-22
- **Files:**
  - create `client/src/components/context-docs/helpers.ts` and `client/src/components/context-docs/constants.ts` (`SOFT_CAP_TOKENS = 4000`)
  - create `client/src/components/context-docs/ContextDocsEditor/{ContextDocsEditor.tsx,styles.ts,index.ts}`, `client/src/components/context-docs/ContextDocsEditor/_components/PreviewDrawer/{PreviewDrawer.tsx,index.ts}` and `client/src/components/context-docs/DocPreview/{DocPreview.tsx,styles.ts,index.ts}`
  - create `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/{ContextTab.tsx,index.ts}` and `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/{ContextTab.tsx,index.ts}`
  - modify `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}`, `client/src/app/skills/[id]/_components/SkillEditor/{constants.ts,SkillEditor.tsx}`, `client/messages/en/context.json`, `client/messages/en/agents.json` and `client/messages/en/skills.json`
- **Skills the implementer must apply:**
  - frontend-ui-architecture §2, §3, §4, §6, §7, §8
  - react-best-practices (§ Derive, Don't Store; § Key Prop Patterns, with key = path; § Accessibility; § useEffect Rules)
  - next-best-practices (§ Directives)
  - `docs/agent-prompts/general-reviewer.md` for the `messages/*.json` files (group F)
- **Constraints:**
  - client/AGENTS.md: UI strings live in `messages/en/*.json`.
  - client/INSIGHTS.md 2026-09-19: edit JSON with targeted edits.
  - client/INSIGHTS.md: a number and its word go in one message.
  - client/INSIGHTS.md 2026-09-23: the `Attach <path>` name for `kit/Checkbox` is visually hidden.
  - Drag is driven by state, with no `dataTransfer` (`SkillsTab.tsx:65-71`).
  - Text goes only through `Markdown`; never use `dangerouslySetInnerHTML`.
- **Steps:**
  1. Pure functions in `helpers.ts`:
     - `buildSections(docs | null, draft, filter)` → `{ manual, groups: {source, rows}[], notFound }`:
       - `manual`: positioned draft items, ascending, including not-found ones.
       - `groups`: every listed doc with no position, attached or not, by source ascending, then path ascending.
       - `notFound`: attached paths that are not in the list and have no position, by path ascending.
       - The filter is a case-insensitive path substring, and empty groups are hidden.
     - Also: `flatOrder(sections)`, `toggle(draft, path)`, `dropOn(draft, order, dragPath, targetPath)`, `moveUp`, `moveDown`, `renumber`, `inheritedSummary(inherited, docs)` (returns `{ count, tokens }` over distinct paths), `total(draft, docs, inherited)` (own attached tokens plus tokens of inherited paths not in the draft, R-14), and `toPayload(draft)`.
  2. The ordering rules (A-23 to A-25):
     - **Drop:**
       - Dropping a row on itself does nothing.
       - If the target is in the manual block, remove the dragged row and insert it before the target.
       - If the target is the first row after the block (or the first row of the list when the block is empty), the dragged row goes last in the block.
       - Dropping on any other row clears the dragged row's position.
     - **Move up:**
       - In the block at index i>0, swap with i−1. Disabled at i=0.
       - On an attached row with no position, it goes last in the block.
     - **Move down:**
       - In the block at i<k−1, swap with i+1.
       - At i=k−1, it clears the position.
       - Disabled on a row with no position.
     - **Tick and untick:** ticking adds the row with no position; unticking removes it and its position.
     - **Renumbering:** after every change the block is renumbered 0..n−1.
     - **Who can move:** only attached rows can be dragged or have Move buttons. A non-empty filter disables all of these and shows `editor.reorderLocked`.
  3. `ContextDocsEditor`:
     - Reads `useActiveRepo()`, `useContextFiles(repoId)` and `useContextSources()`.
     - Seeds the draft from `items`, and resets it when `items` changes.
     - Renders, top to bottom:
       - the filter;
       - the inherited line when `inherited` has paths;
       - the `note`;
       - the rows: badge = `source`, "≈ N tokens", `editor.notFound` with the repo `full_name` and no badge or tokens, and the AC-25 hint when `repoId` is null;
       - `editor.total` = `total(…)`, with the soft-cap badge when that total is greater than `SOFT_CAP_TOKENS`;
       - Save, which calls `onSave(toPayload(draft))`.
     - The list error state follows R-10.
  4. `PreviewDrawer` (`Drawer`) uses `useContextFile` → `DocPreview` (path, source badge, "≈ N tokens", `usedBy`, `Markdown`), plus an `attachAction` / `attached` toggle wired to `toggle`.
  5. The tabs:
     - The agent `ContextTab` wires `useAgentContext` and `useSetAgentContext` and shows a `savedToast` or `saveError` toast, keeping the draft on error.
     - The skill `ContextTab` does the same with the skill hooks and `note = editor.skillNote`, and passes no `inherited`.
  6. Add `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }` after skills (agent) or after config (skill). Both editors render the tab when `tab === "context"`.
- **Done when:** `cd client && pnpm typecheck && pnpm test` exits 0, `git diff -- client/messages/` shows only added or changed keys, and its `[T1]` tests pass.
- **Tests:** see Test brief WP8.tests

### WP9 — Project Context page and nav item   [client · groups C, D]
- **Implements:** R-1, R-8, R-9
- **Files:** create `client/src/app/repos/[repoId]/context/page.tsx`, `client/src/app/repos/[repoId]/context/styles.ts` and `client/src/app/repos/[repoId]/context/_components/DocList/{DocList.tsx,styles.ts,index.ts}` · modify `client/src/vendor/ui/nav.ts` (WORKSPACE item `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` after pulls, with no `gKey`) and `client/messages/en/context.json` (the `empty.*` and page keys)
- **Skills the implementer must apply:** frontend-ui-architecture §1, §12; next-best-practices (§ Directives, § RSC Boundaries); react-best-practices (§ Conditional Rendering, § Accessibility)
- **Constraints:**
  - `vendor/ui/nav.ts` is excluded from review (`routing.md` § Excluded). L02 added the Conventions item there (641b637).
  - Use the existing `Skeleton` and `RepoNotFound` (A-10), as in `conventions/page.tsx:74`.
  - Error tests need a case with stale data (client/INSIGHTS.md 2026-10-02).
- **Steps:**
  1. The page reads `useParams().repoId` and uses `useRepoNotFound`, `useContextFiles`, `useContextSources` and `useContextFile` for the selection.
  2. Errors: a 422 shows the server message (AC-46). Anything else shows an `ErrorState` with `loadError` and a Retry that calls `refetch` (AC-8).
  3. When there are no docs, show `empty.title` and an `empty.body` that names the folders.
  4. `DocList` is the left panel: the filter, groups under source headings, and item buttons named by path with a badge at the right end.
  5. `DocPreview` is the right pane.
- **Done when:** `cd client && pnpm typecheck && pnpm test` exits 0, and its `[T1]` tests pass.
- **Tests:** see Test brief WP9.tests

### WP10 — Trace drawer: Specs read rows, Prompt assembly entries, Remove links   [client · groups C, D, F]
- **Implements:** R-27
- **Files:** modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `.../RunTraceDrawer/RunTraceDrawer.tsx` (the `agentId` prop, passed to `TraceBody`), `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (`agentId={runs.find(r => r.run_id === traceRunId)?.agent_id ?? null}`, next to `:185`) and `client/messages/en/runs.json`
- **Skills the implementer must apply:** frontend-ui-architecture §4 (extract a `SpecsReadRow` if the row has its own conditionals); react-best-practices (§ Conditional Rendering, § Key Prop Patterns); next-best-practices (§ Directives); `docs/agent-prompts/general-reviewer.md` (`runs.json`)
- **Constraints:** AC-44 still holds: with no `project_context` and an empty `specs_read`, Specs read shows "none". Legacy string `specs_read` with no `project_context` renders as it does today (`TraceBody.tsx:44-48`).
- **Steps:**
  1. **Specs read**, when `project_context` is present, shows one row per entry:
     - An included entry shows its path and `specTokens`.
     - A skipped entry shows its path, `skipped.<reason>`, and one link:
       - with `via_skill`: `removeFromSkill` → `/skills/<via_skill.id>?tab=context`;
       - otherwise: `removeFromAgent` → `/agents/<agentId>?tab=context`;
       - with no `via_skill` and a null `agentId`: no link.
  2. **Prompt assembly:**
     - When there are included entries, show a heading with the `trace.prompt.specs` label and one `PromptBlock` per included entry (label `<path> · ≈ N tokens`, `text = entry.text`). This replaces the single specs block.
     - Otherwise keep the block at `:88-90` with the new label.
- **Done when:** `cd client && pnpm typecheck && pnpm test` exits 0, and its `[T1]` tests pass.
- **Tests:** see Test brief WP10.tests

## Implementation order
1. The main session writes `0015` (GT-1).
2. WP0, then WP1. WP3 can run in parallel with both.
3. Server: WP2 → WP4 → WP5 → WP6.
4. Client, once WP1 is done: WP7, then WP8, WP9 and WP10 in parallel or in any order.

WP4 also edits `client/src/vendor/shared/adapters.ts`, so it stays with the server implementer; the client WPs never touch `vendor/shared`. All gates are approved, so no WP is skipped.

## Acceptance criteria
- [ ] `diff -r server/src/vendor/shared client/src/vendor/shared` prints nothing on the final tree (R-37)
- [ ] The sidebar WORKSPACE section has a link "Project Context" with href `/repos/<active repo id>/context` (R-1)
- [ ] `GET /repos/:id/context` on a cloned repo returns 200 with only `.md` paths under a configured folder (at any depth), path ascending, each with `source`, `size` and `tokens = ceil(chars/4)` (R-2, R-3, R-4, R-5)
- [ ] With `PROJECT_CONTEXT_FOLDERS` unset, `specs/x.md` and `a/docs/y.md` are listed and `src/z.md` is not. With `adr,rfc`, `x/adr/1.md` and `rfc/2.md` are listed and `docs/3.md` is not (R-3)
- [ ] A second `GET /repos/:id/context` with the same clone HEAD reads no file (`MockGitClient.readsAtRef` length unchanged). After the HEAD moves, the next call re-reads and reflects the new files (R-36)
- [ ] An uncloned repo returns 422 `This repository has not been cloned yet.`, and an unknown repo returns 404 (R-6)
- [ ] `?path=../.env` and `?path=src/a.ts` on the file route return 404, and `readsAtRef` holds neither path. A listed path returns 200 with `content` and `used_by` (R-7, R-35)
- [ ] Selecting a doc on the page shows its path, "≈ N tokens", the rendered markdown, its source badge and "Used by N agents". The left panel groups docs under source headings in source-name order, and the filter keeps only matching paths (R-8)
- [ ] A doc containing `<script>` renders no `<script>` element on the page, in the drawer or in the Trace (R-9)
- [ ] The agent editor has a "Context" tab right after "Skills". The skill editor has one right after "Config", showing "Any agent using this skill inherits these documents." (R-10, R-22)
- [ ] Context tab row order is: positioned rows by position, then source groups, then attached "Not found in <repo>" rows. Tick, untick, drop and Move follow WP8 step 2. While filter text is present, nothing can be dragged and the Move buttons are disabled (R-10–R-13)
- [ ] The tab shows "≈ N tokens" per row, and "≈ <total> tokens" where total = own attached tokens + inherited-only tokens. "over 4K soft cap" shows when that total is over 4,000. Example: own 3,900 + inherited 200 shows the badge (R-14)
- [ ] Preview opens a drawer with the path, tokens, rendered text, source badge, "Used by N agents" and an Attach / Attached toggle (R-15)
- [ ] Save sends one `PUT /agents/:id/context` (or `/skills/:id/context`) whose `items` hold every attached path with its position or `null`, and shows "Context saved". A failed save shows "Couldn’t save context" and keeps the draft (R-16)
- [ ] PUT `[a:1, b:null, c:0]` → GET `[c:0, a:1, b:null]`. PUT `[a:null, b:0, a:1]` → GET `[b:0, a:null]`. PUT `[a:2, b:7]` → GET `[a:0, b:1]` (R-17)
- [ ] A PUT holding `/etc/a.md`, `a/../b.md`, `a.txt`, position `-1`, position `1.5`, or two different paths at position `0` returns 422, and a following GET is unchanged (R-17)
- [ ] Inserting two rows with the same non-null position for one agent (or one skill) directly into the DB fails with a unique violation, while two rows with `position NULL` succeed (R-38)
- [ ] After a PUT, the agent's `version` and the length of `GET /agents/:id/versions` are unchanged. The same holds for skills (R-18)
- [ ] The `0015` DDL has no column other than `agent_id`/`skill_id`, `path` and `position` (R-19, inspection)
- [ ] An agent whose enabled skill attaches two paths shows "Inherited from skills: 2 documents · ≈ <t> tokens" (R-20)
- [ ] With no repository, the tab lists the attached paths without tokens and shows "Add a repository to see its documents and token counts." (R-21)
- [ ] For a run with agent items `specs/x.md:0`, `specs/b.md:null`, `docs/z.md:null` and the skill doc `docs/s.md`, the one prompt's `## Project context` holds the `<untrusted source="…">` blocks in the order specs/x.md, docs/z.md, specs/b.md, docs/s.md (R-23, R-24)
- [ ] A deleted path ends the run as `done` with the entry `{status:'skipped', reason:'not_found', text:null}`. A 200,001-byte doc gets `reason:'too_large'`. Neither appears in the prompt or in `specs_read` (R-25)
- [ ] Trace `specs_read` equals the included paths in prompt order. `project_context` has one entry per attached path, and each included entry's `text` is the exact added block (R-26)
- [ ] The Trace shows "≈ 120 tokens" and "skipped — not found" rows, with "Remove from agent" → `/agents/<id>?tab=context` or "Remove from skill <name>" → `/skills/<id>?tab=context`. Prompt assembly shows "Project context — attached specs (untrusted)" with one entry per included doc, which opens its `text` verbatim (R-27)
- [ ] A trace with no `project_context` and an empty `specs_read` shows "none" (R-27)
- [ ] An agent with no attachments gets a prompt equal to today's, and its trace has no `project_context` key. The order of the skills section is unchanged when attachments exist (R-28, R-32)
- [ ] The list, file and PUT routes record 0 `MockLLMProvider.calls` and no GitHub call. A run makes the same number of LLM calls with docs as without (R-29, R-30)
- [ ] The run log holds "Project context: 3 document(s) included (≈ N tokens), 1 skipped" and "Project context: skipped specs/gone.md — not_found" (R-31)
- [ ] Deleting an agent or a skill removes its rows from `agent_context_docs` / `skill_context_docs` (R-33)
- [ ] A path that is attached directly and also inherited appears once, with `via_skill: null` (R-34)

## Test plan
| Package | Command | Needs Docker? | Covers |
|---|---|---|---|
| client + server | `diff -r server/src/vendor/shared client/src/vendor/shared` (expect no output) | no | WP0, WP1, WP4: R-37 |
| reviewer-core | `cd reviewer-core && npm test && npm run typecheck` | no | WP3: AC-29, AC-30, AC-41–AC-43, NFR-8 (engine) |
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` | no | WP1, WP4, WP5 helpers: AC-3, AC-4, AC-52, AC-55, A-21, AC-32/AC-33 classification |
| server | `cd server && pnpm exec vitest run .it.test` | yes | WP2, WP5, WP6: AC-2, AC-7, AC-10, AC-19–AC-22, AC-24 (server), AC-28, AC-31, AC-34–AC-36, AC-40, AC-45, AC-48 (server), AC-60, AC-61, NFR-1, NFR-2, NFR-6, NFR-8, R-36, R-38 |
| client | `cd client && pnpm typecheck && pnpm test` | no | WP0 (the typecheck), WP7–WP10: AC-1, AC-5, AC-6, AC-8, AC-9, AC-11–AC-18, AC-23–AC-27, AC-37–AC-39, AC-44, AC-46, AC-48–AC-51, AC-53, AC-54, AC-56–AC-59, AC-62–AC-69, NFR-3, NFR-4, NFR-5, NFR-7 |
| — | inspection of `0015_add_context_docs.sql` | — | AC-47 |

## Docs to update
- `docs/agent-prompts/README.md` § User message: `## Project context` now holds the docs attached to the agent and to its skills, one `<untrusted source="<path>">` block per doc, with `"<>` stripped from the label.
- `server/README.md`: add `PROJECT_CONTEXT_FOLDERS` to the env table (`:102-111`), with default `docs,specs` and a note that invalid names are ignored with a warning. Add a `context` module to the module diagram (`/repos/:id/context`, `/agents|skills/:id/context`, `/context/sources`) and note that the list is cached per clone HEAD.
- `server/.env.example`: add a commented `PROJECT_CONTEXT_FOLDERS=docs,specs`.
- `client/README.md` § UI route map: add `/repos/:repoId/context` and the Context tabs.
- `reviewer-core/README.md:32`: `specs` (L05) accepts `{ source, text }` docs.
- `docs/shared-contracts.md`: state that as of L05 the two vendored copies are byte-identical, and that `diff -r server/src/vendor/shared client/src/vendor/shared` must print nothing.

## Recommendations (not in the plan until you accept them)
- **REC-1** Cache the list route per `(repoId, head sha)`. Accepted → WP5 step 4 (I chose the cache over `cat-file --batch`; see Decisions), R-36, WP5.tests.
- **REC-2** Inherited docs count in the soft-cap total. Accepted → WP8 steps 1 and 3, R-14, WP8.tests.
- **REC-3** Re-sync the vendored twins. Accepted → WP0, R-37, WP0.tests.
- **REC-4** Partial unique position indexes. Accepted → GT-1 DDL, WP2, R-38, WP2.tests.

No new recommendations.

## Execution mode
- **Recommended (and chosen by the user):** multi-agent. The change spans three packages and includes a schema migration, a re-sync of both contract copies plus new contracts, a reviewer-core API change, and group E files.
- **Multi-agent split:**
  1. The main session writes `0015` (GT-1).
  2. test-writer writes T1 (every `[T1]` line).
  3. **implementer #1:** WP0 → WP1 → WP3 → WP2 → WP4 → WP5 → WP6 (shared, reviewer-core, server).
  4. **implementer #2:** WP7 → WP8, WP9, WP10 (client). It starts once WP1 is done and runs in parallel with the rest of #1. They share no files after WP1.
  5. test-writer writes T2.
  6. plan-verifier ∥ architecture-reviewer ∥ security-reviewer.
  7. doc-writer (§ Docs to update).
- **Single-agent:** the main session writes `0015`, writes the T1 tests and sees them fail, implements WP0–WP10 in that order until they pass, writes T2, then runs `scripts/checks.sh`. This gives up independent test oracles and independent verification.

## Risks & open questions
- **WP0 widening:** client `LLMProvider.id` and the plugin and eval provider enums gain `'openrouter'`, and the GitHub port gains members. **Assumption:** no client code switches exhaustively over these types and no client class implements those ports, so `pnpm typecheck` still passes. If it fails, WP0 stops and reports (its Constraints); a fix in client code would then need your decision.
- **Assumption:** react-markdown 9 without rehype-raw renders raw HTML as text, so NFR-3 holds. The T2 `<script>` tests in WP8 and WP9 settle this.
- **Assumption:** `GET /runs/:id/trace` (`server/src/modules/reviews/routes.ts:122`) returns the stored jsonb without stripping keys. The WP6 T1 test settles this.
- **The REC-1 cache** lives in process memory. It is lost on restart (the first call re-reads), and it holds one entry per repo listed, never evicted after the repo is removed (small: paths and numbers only). Uncommitted edits in the clone are invisible to the cache and the list alike, because both read git objects at HEAD (A-2).
- **Existing test assertions:** `AgentEditor.test.tsx`, `SkillEditor.test.tsx` and `RunTraceDrawer.test.tsx` may assert the old tab lists or the old `empty.title` / `trace.prompt.specs` strings. test-writer updates them in T2; the implementer does not.
- **Known server test issues:** `test/reviews.it.test.ts` has a known failure on a clean tree (server/INSIGHTS.md § Open Questions), and testcontainers has a port flake (2026-10-01). Re-run before chasing either.
- **Mock defaults:** `MockGitClient.currentHead()` defaults to `'a1b2c3d4'`, so fixtures key `filesAtRef` as `a1b2c3d4:<path>`. `sync()` moves the head to `syncedHead`, which is how the cache-miss test moves HEAD.
- **Unreadable files** cannot be produced through `MockGitClient`. The T2 tests use a small `GitClient` override instead (WP6.tests).

<!-- test-brief -->
## Test brief

### WP0.tests
- [T2] Given the tree after WP0, when `diff -r server/src/vendor/shared client/src/vendor/shared` runs, then it prints nothing and exits 0. Run it from the repo root, then `cd client && pnpm typecheck` (R-37).
- [T2] Given the client copy, when `AgentVersion.parse({agent_id:'a',version:1,config:{provider:'openrouter',model:'m',system_prompt:'s',strategy:'auto',ci_fail_on:'critical',repo_intel:true,skills:[]},created_at:'2026-10-06'})` runs, then it succeeds. → `client/src/lib/contracts.test.ts` · `cd client && pnpm test` (R-37)

### WP1.tests
- [T2] Given a stored trace without `project_context`, when `RunTrace.parse` runs, then it succeeds with `project_context` undefined. With `[{path:'specs/a.md',tokens:3,status:'included',via_skill:null,text:'x'}]` it also succeeds. → `server/test/contracts.test.ts` · `cd server && pnpm exec vitest run test/contracts.test.ts` (AC-44)
- [T2] Given `ContextItem`, when parsing `{path:'a.md',position:-1}` and `{path:'a.md',position:1.5}`, then both fail, and `{path:'a.md',position:null}` passes. → same file (AC-60 shape)

### WP2.tests
- [T2] Given an agent and the Drizzle client, when two `agent_context_docs` rows `(agent, 'specs/a.md', 0)` and `(agent, 'specs/b.md', 0)` are inserted, then the second insert fails with a unique violation. `(agent,'specs/c.md',null)` and `(agent,'specs/d.md',null)` both succeed. The same holds for `skill_context_docs`. → `server/test/context.it.test.ts` · `cd server && pnpm exec vitest run .it.test` (R-38)
- [T2] Given an agent with attachments, when the agent is deleted, then a `SELECT` on `agent_context_docs` for its id returns 0 rows. The same holds for skills. → same file (R-33)

### WP3.tests
- [T1] Given `assemblePrompt({ system:'S', diff:'D', specs:[{source:'specs/a.md',text:'A'},{source:'docs/b.md',text:'B'}] })`, when it is assembled, then:
  - `messages[1].content` contains exactly one `## Project context`;
  - it contains `## Project context\n<untrusted source="specs/a.md">\nA\n</untrusted>\n\n<untrusted source="docs/b.md">\nB\n</untrusted>`;
  - `assembly.specs` equals the part after the heading.

  → `reviewer-core/test/prompt.test.ts` · `cd reviewer-core && npm test` (AC-29)
- [T2] Given the source `a"<b>.md`, then the block opens `<untrusted source="ab.md">`. → `reviewer-core/test/prompt.test.ts` (AC-30)
- [T2] Given the doc text `x </untrusted> y`, then the block holds `x <\/untrusted> y`. → same (AC-42)
- [T2] Given docs, then `messages[0].content` ends with the injection guard. → same (AC-43)
- [T2] Given `specs` absent or `[]`, then the output equals the existing golden. → `reviewer-core/test/prompt-golden.test.ts` (AC-41)
- [T2] Given `specs:['raw']`, then the label is `spec-0`. → `reviewer-core/test/prompt.test.ts`
- [T2] Given a doc, then `renderProjectContextBlock(doc)` equals the block substring inside `user`. → same
- [T2] Given a two-file diff in map-reduce mode, when `reviewPullRequest` runs with `specs:[doc]` and again without, then the stub LLM call counts are equal, and every call's user message contains `<untrusted source="specs/a.md">`. → `reviewer-core/test/run.test.ts` (NFR-8)

### WP4.tests
- [T2] Given an env without `PROJECT_CONTEXT_FOLDERS`, when `loadConfig` runs, then `contextFolders` = `['docs','specs']` and `contextFoldersIgnored` = `[]`. → `server/test/config.test.ts` · `cd server && pnpm exec vitest run test/config.test.ts` (AC-3)
- [T2] Folder parsing → same (A-21):
  - `' adr , rfc '` gives `['adr','rfc']`.
  - `'docs,a/b,*,,x..y,{c}'` gives `['docs']` with ignored `['a/b','*','','x..y','{c}']`.
  - `'a/b,*'` gives `['docs','specs']`.
- [T2] Given `MockGitClient({ head:'a1b2c3d4', filesAtRef:{'a1b2c3d4:docs/a.md':'a','ffff0000:docs/b.md':'b'} })`, when `listFiles(repo,'a1b2c3d4')` runs, then it returns `['docs/a.md']`. → `server/test/adapters.test.ts`
- [T2] Given `SimpleGitClient`, when `listFiles(repo,'HEAD')` runs, then it throws an invalid-ref error. → `server/test/adapters.test.ts`

### WP5.tests
- [T1] Given a repo row with `clone_path` set and `MockGitClient({head:'a1b2c3d4', filesAtRef:{'a1b2c3d4:specs/b.md':'0123456789','a1b2c3d4:docs/a.md':'# A','a1b2c3d4:src/z.md':'z','a1b2c3d4:x/docs/c.md':'c','a1b2c3d4:docs/img.png':'p'}})`, when `GET /repos/:id/context` runs, then:
  - the status is 200 and the body paths are `['docs/a.md','specs/b.md','x/docs/c.md']`;
  - `specs/b.md` has `tokens: 3`, `size: 10`, `source: 'specs'` and `content: null`;
  - `x/docs/c.md` has `source: 'docs'`.

  → `server/test/context.it.test.ts` · `cd server && pnpm exec vitest run .it.test` (AC-2, AC-4, AC-52)
- [T1] Given that repo, when `GET /repos/:id/context/file?path=specs/b.md` runs, then the status is 200 with `content: '0123456789'`, `tokens: 3`, `source: 'specs'` and `used_by: 0`. → same (AC-10 happy path, AC-48 server)
- [T1] Given an agent, when `PUT /agents/:id/context` sends `{items:[{path:'specs/a.md',position:1},{path:'specs/b.md',position:null},{path:'specs/c.md',position:0}]}` and a GET follows, then the status is 200 and `items` = `[{c,0},{a,1},{b,null}]`. → same (AC-19)
- [T1] Given an agent, when the PUT sends `[specs/a.md:null, specs/b.md:0, specs/a.md:1]`, then GET returns `[{specs/b.md,0},{specs/a.md,null}]`. → same (AC-22)
- [T1] Given an agent, when the PUT sends `[specs/a.md:2, specs/b.md:7]`, then GET returns `[{specs/a.md,0},{specs/b.md,1}]`. → same (AC-61)
- [T1] Given an agent at version v with k versions, when `PUT /agents/:id/context` runs, then `GET /agents/:id` still has `version` v and `/versions` still has length k. The same holds for a skill with `PUT /skills/:id/context`. → same (AC-20)
- [T1] Given a skill, when `PUT /skills/:id/context` sends `{items:[{path:'docs/s.md',position:null}]}` and a GET follows, then the GET returns that same body. → same (AC-26 server)
- [T1] Given that skill linked to an agent (link enabled, skill enabled), when `GET /agents/:id/context` runs, then `inherited` = `[{skill_id:<id>, skill_name:<name>, items:[{path:'docs/s.md',position:null}]}]`. → same (AC-24 server)
- [T1] When `GET /context/sources` runs, then the response is 200 `{folders:['docs','specs']}`. → same (R-8)
- [T2] Given the cloned repo, when `GET /repos/:id/context` runs twice, then `MockGitClient.readsAtRef.length` is the same after the second call as after the first. After `git.sync(repo,'main')` with `syncedHead:'b2c3d4e5'` and `filesAtRef['b2c3d4e5:docs/new.md']='n'`, the next GET lists only `docs/new.md`. → same (R-36)
- [T2] Given a repo without `clone_path`, then the list returns 422 `This repository has not been cloned yet.`. An unknown uuid returns 404, and `/repos/abc/context` returns 422. → same (AC-7)
- [T2] Given the cloned repo, when `?path=` is `../.env`, `src/a.ts`, `/etc/x.md` or `specs/missing.md`, then each returns 404, and `readsAtRef` has no entry for them. → same (AC-10)
- [T2] Given saved items, when the PUT holds `/etc/a.md`, `a/../b.md`, `a.txt` or `-x.md`, then it returns 422 and a following GET is unchanged. → same (AC-21)
- [T2] When the PUT holds positions `-1`, `1.5`, or two different paths at `0`, then it returns 422 and GET is unchanged. `[specs/a.md:0, specs/a.md:0]` returns 200 with one item. → same (AC-60, R-17)
- [T2] Given an unknown agent or skill uuid, when GET or PUT runs on its context, then the response is 404 `Agent not found` / `Skill not found`. → same
- [T2] Given `used_by` for `docs/u.md`: agent A1 attaches it directly, A2 inherits it through an enabled link to an enabled skill, and A3 has it only through a muted link. Then the file route returns `used_by: 2`. → same (AC-48, A-17)
- [T2] Given a muted link or a disabled skill with items, then `inherited` is `[]`. → same (A-5)
- [T2] Given an LLM override and a GitHub client whose methods throw, when the list, file and PUT routes run, then every route returns 2xx and `MockLLMProvider.calls.length` = 0. → same (NFR-1, NFR-2)
- [T2] Given a 200,001-byte `a1b2c3d4:docs/big.md`, then the list entry has `size: 200001` and `tokens: null`. → same (R-5)
- [T2] Unit tests of `sourceOf` and `isDocPath` → `server/test/context-helpers.test.ts` · `cd server && pnpm exec vitest run test/context-helpers.test.ts` (AC-3, AC-52, AC-55):
  - `sourceOf('docs/specs/x.md',['docs','specs'])` = `'docs'`, and `sourceOf('a/docs/y.md',…)` = `'docs'`.
  - `isDocPath` is false for `'src/z.md'`, for `'docs.md'` and for `'docs/A.MD'`.
  - With `['adr','rfc']`, `x/adr/1.md` and `rfc/2.md` match and `docs/3.md` does not.
- [T2] Unit tests of `runOrder`, `normalizeItems` and `classifyRead` → same (A-5, AC-32, R-25):
  - `runOrder([{specs/x.md,0},{specs/b.md,null},{docs/z.md,null},{README.md,null}],['docs','specs'])` returns x, z, b, README.
  - `normalizeItems([a:2,b:7])` → `[a:0,b:1]`, and `normalizeItems([a:0,b:0])` → `duplicate_position`.
  - `classifyRead(null)` → `not_found`.
  - `classifyRead({text:'',bytes:200001},200000)` → `too_large`.
  - `classifyRead({text:'�',bytes:1},200000)` → `unreadable`.

### WP6.tests
- [T1] Given:
  - an agent with items `specs/x.md:0`, `specs/b.md:null` and `docs/z.md:null`;
  - linked (enabled) to the enabled skill "Sec", which has the item `docs/s.md:null`;
  - a cloned repo with `filesAtRef` at `a1b2c3d4` holding `x`='XX', `b`='BBBB', `z`='Z' and `s`='SSSSS';
  - the stub LLM.

  When `POST /pulls/:id/review` runs for that agent and completes, then:
  - the single LLM request's user message contains `## Project context` with the blocks for specs/x.md, docs/z.md, specs/b.md and docs/s.md in that order;
  - `GET /runs/:runId/trace` has `specs_read` = `['specs/x.md','docs/z.md','specs/b.md','docs/s.md']`;
  - `project_context` has 4 entries, all `included`;
  - `via_skill` is null on the first three and `{id:<skill id>, name:'Sec'}` on `docs/s.md`;
  - `tokens` = `[1,1,1,2]`;
  - entry 0's `text` = `<untrusted source="specs/x.md">\nXX\n</untrusted>`.

  → `server/test/context-run.it.test.ts` · `cd server && pnpm exec vitest run .it.test` (AC-28, AC-29, AC-35, AC-36)
- [T2] Given the attached `specs/gone.md` is absent from the clone, then the run ends `done` with the entry `{path:'specs/gone.md',tokens:0,status:'skipped',reason:'not_found',via_skill:null,text:null}`, and the path is in neither `specs_read` nor the prompt. → same (AC-31)
- [T2] Given a 200,001-byte doc, then its entry has `reason:'too_large'` and the doc is not in the prompt. → same (AC-32)
- [T2] Given a `GitClient` override whose `readFileAtRef` returns `{text:'�', bytes:1}`, then the entry has `reason:'unreadable'`. → same (R-25)
- [T2] Given three docs of 6,000 chars each, then all three are included and in the prompt. → same (AC-34)
- [T2] Given a doc whose text names `../secret.md`, then every path in `readsAtRef` is a stored path. → same (AC-33)
- [T2] Given the list tokens t for `docs/a.md`, then the trace entry for it has `tokens` = t. → same (AC-40)
- [T2] Given an agent with no attachments, then:
  - the prompt has no `## Project context`;
  - the trace has no `project_context` key, and `specs_read` = `[]`;
  - the log has no `Project context:` line.

  → same (AC-41)
- [T2] Given two linked skills plus attachments, then `## Skills / rules` keeps link order. → same (AC-45)
- [T2] Given the same PR run with and without docs, then the LLM call counts are equal. → same (NFR-8)
- [T2] Given 3 included docs and 1 skipped doc, then the trace log contains `Project context: 3 document(s) included (≈ <sum> tokens), 1 skipped` and `Project context: skipped specs/gone.md — not_found`. → same (NFR-6)
- [T2] Given `docs/s.md` attached directly and also through the skill, then there is exactly one entry, with `via_skill: null`, and one block. → same (R-34)
- [T2] Given a repo with a null `clone_path`, then every attached path is `skipped/not_found` and the run ends `done`. → same (R-23)

### WP7.tests
- [T2] Given a fetch mock, when `useSetAgentContext().mutate({agentId:'a1', items:[{path:'specs/a.md',position:null}]})` runs, then exactly one `PUT …/agents/a1/context` is sent with body `{"items":[{"path":"specs/a.md","position":null}]}`, and `["agent-context","a1"]` holds the response. → `client/src/lib/hooks/context.test.tsx` · `cd client && pnpm test`
- [T2] Given `useContextFile('r1','docs/a b.md')`, then it requests `/repos/r1/context/file?path=docs%2Fa%20b.md`, and the hook is disabled when `path` is null. → same

### WP8.tests
- [T1] Given an agent, when `AgentEditor` renders, then the tabs read Config, Skills, Context in that order. → `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` · `cd client && pnpm test` (AC-11, NFR-7)
- [T1] Given the docs `specs/a.md` and `specs/b.md` and the items `specs/b.md:1` and `specs/a.md:0`, then the first two listitems are `specs/a.md`, `specs/b.md`, before the first heading. → `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx` (AC-11)
- [T1] Given the docs `docs/b.md`, `docs/c.md` and `docs/d.md`, when the user ticks "Attach docs/c.md" and saves, then `docs/c.md` stays under the "docs" heading between b and d, and the PUT `items` contains `{"path":"docs/c.md","position":null}`. → same (AC-12, AC-18)
- [T1] Given the block `specs/a.md:0`, `specs/b.md:1`, `specs/c.md:2`, when the user does `dragStart(c)`, `dragOver(a)` and `drop(a)`, then the row order starts c, a, b. → same (AC-13)
- [T1] Given one attached doc, when Save succeeds, then exactly one `PUT /agents/<id>/context` is sent and "Context saved" renders. → same (AC-18)
- [T1] Given attached docs of 3 and 5 tokens and no inherited docs, then the rows show "≈ 3 tokens" and "≈ 5 tokens" and the total shows "≈ 8 tokens". Given an attached total of 4,001, then "over 4K soft cap" renders. → same (AC-15, AC-16, NFR-5)
- [T1] When Preview is clicked on a row, then a drawer shows the path, "≈ N tokens", the text "Title" rendered from `# Title`, and an "Attach" button. → same (AC-17)
- [T1] Given `inherited` holding `docs/s.md` and `docs/t.md`, then "Inherited from skills: 2 documents" renders. → same (AC-24)
- [T1] Given a skill, when `SkillEditor` renders, then the tabs read Config, Context, Preview, Versions. The Context tab shows "Any agent using this skill inherits these documents.", and Save fires `PUT /skills/<id>/context`. → `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/ContextTab.test.tsx` (AC-26, AC-27)
- [T2] Given an own attached total of 3,900 and an inherited-only doc of 200 tokens, then the total reads "≈ 4,100 tokens" and "over 4K soft cap" renders. If the inherited path is also attached directly, it is counted once. → agent ContextTab test (R-14, REC-2)
- [T2] Given filter text "a", then no listitem has `draggable="true"`, every Move button is disabled, and "Clear the filter to reorder." renders. → same (AC-14)
- [T2] Given the attached `specs/gone.md` is not in the list, then its row reads "Not found in <owner/name>" with no token text and no badge, still has its attach checkbox, and the total excludes it. → same (AC-23, AC-56)
- [T2] Given `repoId: null`, then the attached paths render without tokens and "Add a repository to see its documents and token counts." renders. → same (AC-25)
- [T2] Given the list GET fails, once with `isError` and no data and once with `isError` and stale data, then the error message renders and the attached rows still render. → same (R-10)
- [T2] Given the block `a:0` and grouped rows d and e:
  - dropping e (attached) on d puts a, e at the top;
  - dropping a on the second row below the block moves it under its source heading, and Save sends `a` with `position: null`.

  → `client/src/components/context-docs/helpers.test.ts` and the ContextTab test (AC-62, AC-63)
- [T2] Given the block a, b, c, when c is moved up twice and saved, then the PUT positions are c:0, a:1, b:2. → ContextTab test (AC-64, NFR-4)
- [T2] Given an unattached row, then it has no Move buttons and is not draggable. → same (AC-65)
- [T2] Given the block row `specs/a.md`, when it is unticked and ticked again, then it sits under the "specs" heading and Save sends `position: null`. → same (AC-66)
- [T2] Given an attached unpositioned row, "Move <path> up" makes it the last row of the block. On the last block row, "Move <path> down" moves it under its source heading. Move up is disabled on the first block row, and Move down is disabled on an unpositioned row. → same (AC-67, AC-68, NFR-4)
- [T2] Given an unpositioned not-found path, then it renders after the last group. → same (AC-69)
- [T2] Given `specs/b.md:0`, attached unpositioned `specs/a.md` and unattached `docs/z.md`, then the order is b, the "docs" heading, z, the "specs" heading, a. The skill tab renders the same. → same, plus the skill ContextTab test (AC-57, AC-58)
- [T2] Given the Preview drawer for `source:'specs'`, `used_by:2`, then the "specs" badge and "Used by 2 agents" render. Clicking "Attach" changes it to "Attached" and ticks the row. → agent ContextTab test (AC-49, AC-59)
- [T2] Given the PUT fails, then "Couldn’t save context" renders and the rows stay ticked. → same (A-6)
- [T2] Given drawer content `<script>window.__x=1</script>`, then there is no `script` element and `window.__x` is undefined. → same (NFR-3)

### WP9.tests
- [T1] Given the active repo `r1`, when `AppShell` renders, then a link "Project Context" with href `/repos/r1/context` appears in WORKSPACE after "Pull Requests". → `client/src/components/app-shell/AppShell.test.tsx` · `cd client && pnpm test` (AC-1, NFR-7)
- [T1] Given `[specs/a.md (tokens 3)]` and file content `# Heading A` with `used_by: 3`, when the user clicks the `specs/a.md` item, then the pane shows "specs/a.md", "≈ 3 tokens", the heading "Heading A" and "Used by 3 agents". → `client/src/app/repos/[repoId]/context/page.test.tsx` (AC-5, AC-48)
- [T1] Given `specs/public-api.md` and `docs/x.md`, when the user types "API" in the filter, then only `specs/public-api.md` is listed. → same (AC-6)
- [T2] Given the list returns 500, both with and without stale data, then "Couldn’t load specs" and a Retry button render, and Retry requests `/repos/r1/context` again. → same (AC-8)
- [T2] Given a 422 with message `This repository has not been cloned yet.`, then that text renders. → same (AC-46)
- [T2] Given an empty list and the sources `['docs','specs']`, then "No documents found" renders, with a body naming "docs" and "specs". → same (AC-9)
- [T2] Given items, then each item has a `source` badge. With `specs/b.md`, `docs/z.md` and `docs/a.md`, the "docs" heading (a, z) comes before the "specs" heading (b). A filter that matches only `specs/` hides the "docs" heading. → same (AC-53, AC-54, A-20)
- [T2] Given content `<script>window.__y=1</script>`, then there is no `script` element and `window.__y` is undefined. → same (NFR-3)

### WP10.tests
- [T1] Given `project_context` = `[{path:'specs/a.md',tokens:120,status:'included',via_skill:null,text:'<untrusted source="specs/a.md">\nA\n</untrusted>'},{path:'specs/gone.md',tokens:0,status:'skipped',reason:'not_found',via_skill:null,text:null}]`, when `TraceBody` renders, then Specs read shows "specs/a.md" with "≈ 120 tokens" and "specs/gone.md" with "skipped — not found". → `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx` · `cd client && pnpm test` (AC-37)
- [T1] Given the same trace, when Prompt assembly is expanded, then "Project context — attached specs (untrusted)" renders with one entry "specs/a.md". Opening the entry shows `<untrusted source="specs/a.md">\nA\n</untrusted>` verbatim. → same (AC-38, AC-39, NFR-7)
- [T2] Given a trace with no `project_context` and `specs_read: []`, then "none" renders without an error. Given a legacy `specs_read: ['x.md']`, then "x.md" renders. → same (AC-44)
- [T2] Given a skipped entry and `agentId='ag1'`, then "Remove from agent" links to `/agents/ag1?tab=context`. With `via_skill:{id:'sk1',name:'Security'}`, it reads "Remove from skill Security" and links to `/skills/sk1?tab=context`. With a null `agentId` and no `via_skill`, there is no link. → same (AC-50, AC-51)
- [T2] Given `too_large` and `unreadable` entries, then "skipped — too large" and "skipped — unreadable" render. → same (AC-37)
- [T2] Given an entry whose text contains `<script>window.__z=1</script>`, then no `script` element renders. → same (NFR-3)
