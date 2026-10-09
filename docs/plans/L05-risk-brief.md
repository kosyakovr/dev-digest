# Implementation Plan: Risk Brief
**Status:** approved
**Spec:** specs/L05-risk-brief.md @ bc1a7b1
**Approved:** 2026-10-09 by the user — gates: GT-1 ✓ (option A) · execution mode: multi-agent · accepted: REC-1, REC-2, REC-3, REC-4
Packages: server, client, both vendored `@devdigest/shared` `contracts/brief.ts` · Requirements: specs/L05-risk-brief.md · Lesson/ticket: L05

Path abbreviations used below: `BR/` = `server/src/modules/brief/` · `PR/` = `client/src/app/repos/[repoId]/pulls/[number]/` · `OV/` = `PR/_components/OverviewTab/` · `DV/` = `client/src/components/diff-viewer/` · `CD/` = `client/src/components/confirm-dialog/`.

## Summary
This plan adds a new server module `BR/` with `GET` and `POST /pulls/:id/brief`. The POST works in this order:
1. Check the `risk_brief` key.
2. Use the stored Intent, or derive one.
3. Collect the blast radius, the PR history and the docs of the enabled agents.
4. Make one structured `risk_brief` call over those facts, and log `prompt: assembled` with kind `brief`.
5. Check every file and line in the answer against the PR's diff, clamp it, and store it in the existing `pr_brief` row.

The two `contracts/brief.ts` copies gain `ReviewFocusItem`, `PrBriefGeneration` and `PrBriefResponse`. `GET /pulls/:id` now also writes `head_sha`. On the client:
- The Overview gets a PR Brief section built on an extended `VerdictBanner`, Risk areas inside the Intent card and a Review focus panel.
- Files changed accepts `?file=&line=` deep links.
- A shared `ConfirmDialog` replaces the tour's `RegenerateDialog` and serves the brief's refresh too.

**Intended paid-call change (S-13):** Intent caches by input hash, and the hash includes the head SHA (`server/src/modules/intent/helpers.ts:306-327`, `intent/service.ts:159-172`). `GET /pulls/:id` now writes `head_sha` (AC-52). So the first review after a push re-derives Intent with one `review_intent` call, even when the PR list was not synced in between.

**Decisions from the user, 2026-10-09:**
- GT-1: option A (direct import of `classifyFile`).
- REC-1…REC-4 are accepted and folded into the work packages.
- The Requirements review defaults are accepted.
- Execution mode: multi-agent.

## Requirements review
| ID | Requirement (short) | Source | Verdict | Note / default taken |
|---|---|---|---|---|
| R-1 | GET returns the stored brief (or null), with `generating` and `stale`; no model, GitHub or index call | specs/L05-risk-brief.md AC-1, AC-2, AC-3 | ok | `stale` = `generation.head_sha !== pull_requests.head_sha`; false when `brief` is null. |
| R-2 | 404 for an unknown or other-workspace PR, 422 for a non-uuid id, on both routes | AC-4, AC-51 | ok | `IdParams` already exists (`server/src/modules/_shared/schemas.ts:11`). |
| R-3 | POST makes one `risk_brief` call and stores the brief with `generation.head_sha` = the head read at start; returns 200 with `stale:false` | AC-5, AC-7 | ok — default accepted by user 2026-10-09 | The POST response computes `stale` against the head read at start, so it is always false. |
| R-4 | No stored intent → derive and store one on `review_intent` first; a stored intent (even a stale one) is used as it is | AC-6, A-11 | ok | Uses the existing `IntentService.get` / `derive` (`intent/service.ts:54,61`). |
| R-5 | Prompt facts and their limits; one `<untrusted>` JSON block | AC-8, NFR-3, NFR-4, A-5, A-6 | ok — default accepted by user 2026-10-09 | "Untrusted facts ≤45,000 chars" means `JSON.stringify(payload).length ≤ 45_000` for the payload passed to `wrapUntrusted`. A list's 4,000 chars is the sum of its path lengths. The PR title and body are not sent, because NFR-3 and NFR-7 do not list them. |
| R-6 | Docs of every enabled agent, own plus inherited, each path once; `specs_read` lists the paths whose text went in | AC-9, A-4, A-5 | ok — default accepted by user 2026-10-09 | `listEnabled` has no ORDER BY (`agents/repository.ts:67-72`). Agents are sorted by `name`, then `id`. Docs follow each agent's `resolveForRun` order, and the first time a path appears is the one kept. |
| R-7 | Drop a focus item whose file is not changed, or whose line is not on the new side of one of its hunks; a file with no patch drops its items | AC-10, AC-11, A-7 | ok — default accepted by user 2026-10-09 | A hunk's new side is `[c, c+d-1]` from `@@ -a,b +c,d @@`. `d` is 1 when omitted and `d=0` means an empty range. Context lines inside a hunk count. |
| R-8 | `file_refs`: strip `:n` / `:n-m`, keep only changed paths, each once; keep a risk whose list ends empty | AC-12, A-8 | ok | — |
| R-9 | Clamp to A-9's limits in the model's order; drop a repeated focus `file:line` | AC-13, A-9 | ok — default accepted by user 2026-10-09 | Order of operations: ground, then remove duplicates, then cap at 6. |
| R-10 | An empty summary → 502 with the spec message; stored brief kept | AC-14 | ok | — |
| R-11 | No `risk_brief` key → 422 with the provider's message; no model call, no intent call | AC-15, A-13 | ok | `ConfigError` (`platform/container.ts:225`) is mapped to `ValidationError`, as `intent/service.ts:85` does. |
| R-12 | Intent derivation fails → the Intent Layer's error, no brief call, stored brief kept | AC-16 | ok | `derive` already throws 422 or 502 (`intent/service.ts:84-88`). |
| R-13 | A failing or timed-out brief call → 502; 120 s wall clock; `maxTokens` 6,000; `maxRetries` 1 | AC-17, NFR-1, NFR-2, A-10 | ok — default accepted by user 2026-10-09 | NFR-1 is tested in server-unit: `callBriefModel` gets an injected short deadline. The route keeps the stored brief on any failure (AC-17). spec-creator is updating the spec's Traceability row in parallel; this plan does not edit the spec. |
| R-14 | One generation per PR: a parallel POST gets 409; GET reports `generating` | AC-18, AC-19, A-2 | ok | Same in-process Set as `onboarding/service.ts:44,75-83`; lost on restart. |
| R-15 | A degraded blast or history still produces a stored brief; the prompt names the incomplete blast and its reason | AC-20, AC-21 | ok | Both services already return a degraded result without throwing (`blast/service.ts:17-49`, `blast/history.ts:49-50`). |
| R-16 | No `pr_files` → 422 with the spec message; no model call | AC-22, A-19 | ok | — |
| R-17 | A stored JSON that does not parse → `brief:null` plus one `brief: unreadable` warn line | AC-23, A-20 | ok | — |
| R-18 | `GET /pulls/:id` writes GitHub's `head_sha` in its existing update; the offline fallback does not write it; Intent's `stale` follows | AC-52, AC-53, AC-54, A-3 | ok | The update sits at `server/src/modules/pulls/routes.ts:340-350`. It is the intended paid-call change (Summary). |
| R-19 | No tools; data sent only to the two feature-model providers and to GitHub's history calls (≤20 + ≤10); cost and tokens copied, null stays null | NFR-6, NFR-7, NFR-8 | ok | The history caps are already built: `blast/constants.ts:8,10`. |
| R-20 | One `brief: generated` / `brief: failed` line with the listed fields and no text | NFR-9 | ok — default accepted by user 2026-10-09 | Every POST that fails after the 409 guard is taken logs `brief: failed`. No logged key may be `diff`, `body`, `content`, `text` or `systemPrompt`; these are pino redact paths (`platform/prompt-log.ts:8-9`). |
| R-21 | The 11th POST in a minute → 429 | NFR-12, A-21 | ok | Only testable with `NODE_ENV: 'development'` (server/INSIGHTS.md 2026-10-02). |
| R-22 | Shared contract shape; both copies byte-identical; no migration or schema change | § Contract, AC-50, A-24 | ok | Nothing reads `PrBrief` today; the only hit is the type re-export at `client/src/lib/types.ts:37`. |
| R-23 | Intent, blast and history routes keep their shapes | AC-49 | ok | Their routes are not edited. |
| R-24 | Empty state; Generate sends POST with no dialog | AC-24, AC-57 | ok | — |
| R-25 | Loading state, 5 s polling, an elapsed counter only for this page's own request | AC-25, AC-26, AC-60, AC-61, A-25 | ok | — |
| R-26 | The banner shows the latest review's verdict, counts and score, or the summary and refresh only | AC-27, AC-28, A-12 | ok — default accepted by user 2026-10-09 | "Latest" = the first review with a verdict in `usePrReviews` order (newest first). Blockers = CRITICAL and not dismissed (`ReviewRunAccordion.tsx:56`). |
| R-27 | Risk areas in the Intent card: title, severity text, first file, a "why" toggle, an empty text | AC-29, AC-30, AC-31 | ok | `noRisks` already exists (`client/messages/en/brief.json:8`). |
| R-28 | Review focus panel with a count badge, or "No review focus items" | AC-32, AC-33, A-26 | ok | — |
| R-29 | Deep link into Files changed: expand the group and file, scroll, highlight, fall back when the line is missing, a "not in diff" notice; keyboard and focus | AC-34, AC-35, AC-36, AC-37, AC-38, NFR-10, A-15 | ok — default accepted by user 2026-10-09 | AC-35 is `demo`. The deep link uses `router.push`, so Back returns to Overview; a tab click clears `file` and `line`. The target is applied when Files changed mounts. |
| R-30 | Stale marker with a 7-char SHA; a reload shows the stored brief with no POST | AC-39, AC-40, A-17 | ok | — |
| R-31 | Refresh → confirm dialog → POST; Cancel or Escape sends nothing | AC-41, AC-55, AC-56 | ok | Built on the shared `ConfirmDialog` (WP7). |
| R-32 | A generate error shows an alert and keeps the previous view; a load error shows Retry | AC-42, AC-43 | ok | The global `MutationCache` toast (`client/src/lib/providers.tsx:41-43`) also fires, as on the tour. |
| R-33 | Degraded notices with their reason | AC-44 | ok | — |
| R-34 | "{model} · {cost}" under the summary; null cost → "—" | AC-58, AC-59 | ok | `formatCost(0.0123)` = "$0.01" (`client/src/lib/format.ts:32-38`). |
| R-35 | Model text is rendered as plain text | NFR-5, A-16 | ok | No markdown renderer, no `dangerouslySetInnerHTML`. |
| R-36 | Exact wording | NFR-11, A-23 | ok | The `block.risks` reword is included. |
| R-37 | Intent card, Blast card, the Agent runs banner and Files changed without a target keep working | AC-45, AC-46, AC-47, AC-48 | ok — default accepted by user 2026-10-09 | `OV/OverviewTab.test.tsx` renders without a QueryClient and will break once OverviewTab calls the brief hooks. This is an intended break that test-writer handles in T1. |

spec-lint printed nothing. All Self-check boxes are ticked, there are no `[NEEDS CLARIFICATION]` markers, the spec status is `approved`, and no `P-n` is planned beyond the accepted P-1, P-2, P-4 and P-5 (P-3 is rejected). The repo history has no earlier brief solution (`git log --all -i --grep brief` finds nothing).

## Goal
A reviewer can ask for a Risk Brief on a PR. It holds a summary, risk areas, and focus items checked against the diff, and it is stored per PR. It shows again without a new call, is marked stale after new commits, and its links land on lines inside Files changed.

## Non-goals
- No automatic generation. No call to `POST /pulls/:id/brief` outside the user's click: there is none in `server/src/modules/reviews/**` and none in a client `useEffect`.
- No migration and no schema change. `git status --porcelain -- server/src/db/migrations server/src/db/schema server/src/db/schema.ts` prints nothing.
- No brief history, no MCP tool, and nothing in `mcp-server/`, `reviewer-core/` or `e2e/` changes. `git status --porcelain -- mcp-server reviewer-core e2e` prints nothing.
- The brief never reaches a reviewer prompt or changes a finding: `server/src/modules/reviews/` is not modified.
- No `BriefCard` that redraws Intent or Blast; no cost badge in VerdictBanner.
- The tour's behaviour does not change: its dialog texts, Escape, initial focus and focus return stay as they are.

## What already exists (do not rebuild)
- `pr_brief` table: `pr_id` PK, `json` jsonb — `server/src/db/schema/reviews.ts:74-79`
- `PrBrief`, `Intent`, `BlastRadius`, `Risk`, `RiskSeverity`, `PrHistory`; the twin copies are byte-identical — `server/src/vendor/shared/contracts/brief.ts:9-145`
- The `risk_brief` feature model, default `openai`/`gpt-4.1` — `server/src/vendor/shared/contracts/platform.ts:61-66`; `container.resolveFeatureModel` — `server/src/platform/container.ts:160`
- Intent get and derive with 422/502 mapping — `server/src/modules/intent/service.ts:54-89`; the facade has only `resolveForReview` — `intent/types.ts:16-30`; `container.intent` — `container.ts:153-157`
- Blast and history services, which never throw on index or GitHub state — `server/src/modules/blast/service.ts:15-48`, `blast/history.ts:22-130`; they are constructed only in `blast/routes.ts:17-18`, not on the container
- Project context per agent — `server/src/modules/context/service.ts:196` (`resolveForRun`, never throws, `ProjectDoc {source, text}` at `reviewer-core/src/prompt.ts:38-41`); `container.projectContext` — `container.ts:125-129`; `container.agentsRepo.listEnabled` — `agents/repository.ts:67`
- `classifyFile` — `server/src/modules/reviews/smart-diff/helpers.ts:76`
- `wrapUntrusted`, which escapes `</untrusted>` — `reviewer-core/src/prompt.ts:31-35`; `describeSection` — `reviewer-core/src/index.ts:31-36`
- `logPrompt` / `PromptLogInput` (`kind: 'review' | 'intent'`) — `server/src/platform/prompt-log.ts:38-54,120-125`; the intent call site — `intent/service.ts:183-195`
- A wall-clock model-call race and the 120 s / 6,000 / 1 bounds — `server/src/modules/onboarding/model-call.ts:23-53`, `onboarding/constants.ts:7-10`
- The in-process 409 guard and the `generating` flag — `onboarding/service.ts:44,75-83`
- Upsert on the PK — `onboarding/repository.ts:26-31`
- `MockLLMProvider` with `structuredBySchema`, which always returns `costUsd: 0.001` — `server/src/adapters/mocks.ts:49-110`; `MockPrIntent` — `mocks.ts:380-390`; `MockGitHubClient` options — `mocks.ts:127-139`
- The `GET /pulls/:id` update without `head_sha` — `server/src/modules/pulls/routes.ts:340-350`; the offline fallback — `:353-385`
- The tour's confirm dialog — `client/src/app/repos/[repoId]/tour/_components/RegenerateDialog/RegenerateDialog.tsx:13-57` (Escape and initial focus) plus its `styles.ts`; its only call site — `client/src/app/repos/[repoId]/tour/_components/TourView/TourView.tsx:11,162`
- Client:
  - VerdictBanner, which requires `verdict` — `PR/_components/VerdictBanner/VerdictBanner.tsx:12-58`
  - the IntentCard states — `OV/_components/IntentCard/IntentCard.tsx:53-136`
  - `formatCost` — `client/src/lib/format.ts:32`
  - `shortSha` (route-local) — `client/src/app/repos/[repoId]/tour/helpers.ts:7`
  - the poll pattern — `client/src/lib/hooks/onboarding.ts:9,17`
  - the tab in `?tab=` — `PR/page.tsx:64-72`
  - RoleGroup's collapse default — `PR/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx:23`
  - FileCard's open state — `DV/FileCard/FileCard.tsx:45-47`
  - parsed lines carry `newNo` — `DV/helpers.ts:4-9`
- The `brief` i18n namespace is loaded from `messages/en/brief.json` — `client/src/i18n/request.ts:16-25`

## Contract
**Routes** (in the new module `BR/routes.ts`, registered in `server/src/modules/index.ts`):
- `GET /pulls/:id/brief` → 200 `PrBriefResponse`. `{ schema: { params: IdParams, response: { 200: PrBriefResponse } } }`.
- `POST /pulls/:id/brief`, no body → 200 `PrBriefResponse`, with `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`.
- Errors (the envelope from `platform/errors.ts`):

| Status | Message |
|---|---|
| 404 | `Pull request not found` |
| 409 | `A brief is already being generated for this pull request.` (code `brief_in_progress`) |
| 422 | `<PROVIDER>_API_KEY is not configured` |
| 422 | `This pull request has no changed files to brief yet.` |
| 502 | `Intent derivation failed: …` |
| 502 | `Brief generation failed: <reason>` |
| 502 | `Brief generation failed: timed out after 120 s` |
| 502 | `Brief generation failed: the model returned an empty summary.` |

**Shared contract** — append to BOTH `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`, byte-identical:
```ts
export const ReviewFocusItem = z.object({ file: z.string(), line: z.number().int().min(1), reason: z.string() });
export const PrBriefGeneration = z.object({
  head_sha: z.string(), generated_at: z.string(), provider: z.string(), model: z.string(),
  tokens_in: z.number().int(), tokens_out: z.number().int(), cost_usd: z.number().nullable(),
  specs_read: z.array(z.string()),
});
export const PrBrief = z.object({ intent: Intent, blast: BlastRadius, risks: Risks, history: PrHistory,
  summary: z.string(), review_focus: z.array(ReviewFocusItem), generation: PrBriefGeneration });
export const PrBriefResponse = z.object({ brief: PrBrief.nullable(), generating: z.boolean(), stale: z.boolean() });
// + `export type X = z.infer<typeof X>` for each new schema
```

**Model answer** (`BR/prompt.ts`; the field order is generation order, and there is no `.max()`, as at `intent/prompt.ts:11-15`):
```ts
export const BRIEF_SCHEMA_NAME = 'PrRiskBrief';
export const BriefAnswerSchema = z.object({
  risks: z.array(z.object({ kind: z.string(), title: z.string(), explanation: z.string(),
    severity: RiskSeverity, file_refs: z.array(z.string()) })),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })),
  summary: z.string(),
});
```

**Server facades and platform changes** (all in-process; reached through `Container`):
```ts
// server/src/modules/intent/types.ts — PrIntentFacade gains the two existing IntentService methods
get(workspaceId: string, prId: string): Promise<PrIntentResponse>;
derive(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntentResponse>;
// server/src/modules/blast/types.ts (new)
export interface PrBlastFacade {
  getBlast(workspaceId: string, prId: string, logger?: ChildableLogger): Promise<BlastRadius>;
  getHistory(workspaceId: string, prId: string, logger?: ChildableLogger): Promise<PrHistory>;
}
// container.ts: `get prBlast(): PrBlastFacade`; ContainerOverrides gains `prBlast?: PrBlastFacade`
// platform/prompt-log.ts: PromptLogInput.kind becomes 'review' | 'intent' | 'brief'
// adapters/mocks.ts: MockLLMOptions gains `costUsd?: number | null` (absent → 0.001 as today)
```

**Client seams fixed for T1:**
- `OverviewTab` props:
  ```ts
  { prId, repoId, repoFullName, headSha, prBody,
    changedFiles: string[], reviews: ReviewRecord[],
    onOpenFile: (file: string, line: number | null) => void }
  ```
  It reads the brief through the real hooks: `GET /pulls/:prId/brief`, `POST /pulls/:prId/brief`.
- `VerdictBanner` props:
  ```ts
  { verdict?: Verdict | null; summary: string | null; score?: number | null;
    findingsCount?: number; blockers?: number; agentName?: string | null;
    loading?: boolean; onRegenerate?: () => void; regenerateLabel?: string;
    regenerateDisabled?: boolean; provenance?: string; footer?: React.ReactNode }
  ```
  - `verdict` absent → no icon box and no verdict label.
  - `findingsCount` absent → no findings badge.
  - `loading` → a spinner where the score column is.
  - `onRegenerate` → a button whose accessible name is `regenerateLabel`.
  - `provenance` → a `role="img"` span whose `aria-label` and `title` are the provenance text.
  - `footer` is rendered under the summary.
- `ConfirmDialog` (`CD/ConfirmDialog/ConfirmDialog.tsx`, export `ConfirmDialog`, re-exported from `CD/index.ts`):
  ```ts
  { title: string; body: string; confirmLabel: string; cancelLabel: string;
    onConfirm: () => void; onCancel: () => void }
  ```
  - Built on `kit/Modal` with a padded body.
  - Escape calls `onCancel`.
  - On mount, focus moves to the confirm button.
- `DiffTab` gains `target?: { file: string; line: number | null } | null`. The target file's role group and file card render open. The rendered row of the target line carries `data-target-line="true"`. The target file's header gets focus.
- Page query: `?tab=diff&file=<encodeURIComponent(path)>&line=<n>`. `line` is omitted for a risk file.
- Hooks in `client/src/lib/hooks/brief.ts`:
  - `usePrBrief(prId)`, query key `["pr-brief", prId]`.
  - `useGeneratePrBrief(prId)`.

**`client/messages/en/brief.json`:** the § Contract keys of the spec, verbatim, plus the reword `block.risks` → "Risk areas".

## Decisions taken
| Decision | Why | Rejected alternative |
|---|---|---|
| New module `BR/` that reaches intent, blast, context and agents only through `container.*` | onion-architecture §4 (no reach into another module's folder), §2 | Importing `../intent/service.js` or `../blast/service.js` |
| GT-1 = A (user, 2026-10-09): `BR/service.ts` imports the pure `classifyFile` from `../reviews/smart-diff/helpers.js`. **Tell architecture-reviewer that the user approved this one sideways import.** | One pure function, the same shape as onion §11's pure-function exception. A facade around it would be ceremony (onion §5, §12). | (B) a `container.smartDiff` facade with an override |
| `PrIntentFacade` gains the existing `get`/`derive`; `MockPrIntent` implements them | Reuses the 422/502 mapping at `intent/service.ts:84-88`; onion §5 (facade + double) | A new intent method, or duplicating derive |
| New `PrBlastFacade` (`blast/types.ts`) + `container.prBlast` + `MockPrBlast` | onion §5 (facade declared in `types.ts`, a container getter and an override, a double in `mocks.ts`); precedent `container.projectContext` (`container.ts:125`) | `new BlastService(container)` inside the brief |
| Synchronous POST; one service per app holds a `Set` guard | A-1, A-2; `onboarding/routes.ts:16-17`, `onboarding/service.ts:44` | A background job |
| The model call is raced against a 120 s wall clock in `BR/model-call.ts`; the deadline is a parameter, tested in server-unit (REC-3) | NFR-1. `timeoutMs` is per attempt and ignored on OpenRouter (server/INSIGHTS.md 2026-09-23, 2026-10-02) | Relying on `timeoutMs`; a 120 s `.it` test |
| Answer field order `risks` → `review_focus` → `summary` | Field order is generation order (`docs/lesson-log.md:18`), so the summary is written after the risks it rests on | Summary first |
| Hunk ranges parsed in `BR/helpers.ts` from the stored `patch` | A pure function with no reviewer-core change; reviewer-core's `buildLineIndex` (`reviewer-core/src/grounding.ts:33`) is not exported and needs a `UnifiedDiff` | Changing reviewer-core |
| `prompt: assembled` with `kind: 'brief'` and content-free sections (REC-1) | Observability parity with `intent/service.ts:183-195`; `prompt-log.ts` may be imported from ring ② (onion §1) | No prompt metadata log for the brief |
| `MockLLMOptions.costUsd` (REC-4) | NFR-8's null-cost case needs no hand-written stub | A custom stub class in the test |
| Risk areas reach IntentCard through a `children` slot; OverviewTab owns the brief hooks | frontend-ui-architecture §8 (lift to the nearest common owner; pass `children`) | IntentCard fetching the brief itself |
| `shortSha` promoted to `client/src/lib/format.ts`; `tour/helpers.ts` re-exports it | frontend-ui-architecture §2, §6, §10 | Importing `tour/helpers.ts` |
| The tour's `RegenerateDialog` is promoted to a shared `CD/ConfirmDialog`, which both the tour and the brief use (REC-2) | frontend-ui-architecture §2: promote on the second consumer; one copy of the Escape and focus logic | A route-local copy for the brief; importing `tour/_components` |
| The deep link uses `router.push`; tab clicks keep `router.replace` and clear `file`/`line` | A-15: Back returns to Overview (`page.tsx:70` uses `replace`) | `replace` for the deep link |

## Gates — need user approval before implementation
- [x] **GT-1 — how the brief gets each file's Smart Diff role (AC-8, NFR-3).** Decided by the user 2026-10-09: option A, the direct import of `classifyFile` from `../reviews/smart-diff/helpers.js` in `BR/service.ts`. architecture-reviewer must be told this import is approved (onion-architecture §4 vs §11).

No other gate: no schema, migration, dependency, `package.json` or `.claude/` change, and no route, field or column is removed.

## Work packages

### WP1 — Shared contract, both copies   [server + client · groups B, E]
- **Implements:** R-22
- **Files:** modify `server/src/vendor/shared/contracts/brief.ts` · modify `client/src/vendor/shared/contracts/brief.ts`
- **Skills the implementer must apply:**
  - zod §1 (`schema-avoid-optional-abuse`: the new members are required, A-24), §3 (`type-use-z-infer`, `type-export-schemas-and-types`)
  - onion-architecture §8 (snake_case DTOs; change both copies together)
  - Group E: the server copy is security-sensitive (security skill A08 — data integrity of the wire shape); no review step is planned.
- **Constraints:** root AGENTS.md § Cross-package invariants. The barrel already re-exports `./contracts/brief.js` (`server/src/vendor/shared/index.ts:19`).
- **Steps:** 1. Add the § Contract schemas and their `z.infer` types after `PrBrief`, extending `PrBrief` in place. 2. Copy the file byte for byte to the client.
- **Done when:**
  - `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing.
  - `grep -c "PrBriefResponse" server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints a count ≥2 for each file. This is the positive control that proves the diff is not empty because nothing changed.
  - `cd server && pnpm typecheck` exits 0.
- **Tests:** see Test brief WP1.tests

### WP2 — Container facades for intent and blast; mock cost option   [server · groups A, E]
- **Implements:** R-4, R-12, R-15, R-19 (seams; NFR-8 test support)
- **Files:**
  - create `server/src/modules/blast/types.ts`
  - modify `server/src/modules/intent/types.ts`
  - modify `server/src/platform/container.ts`
  - modify `server/src/adapters/mocks.ts`
- **Skills the implementer must apply:**
  - onion-architecture §5 (facade in `types.ts` + container getter + override + double declared `implements`), §11 (`container.ts` may import module services; do not "fix" it), §2 (docblock naming the ring)
  - fastify-best-practices § Core Principles (encapsulation: no route change here)
  - Group E (`platform/**`): security A06 Insecure Design — the facade adds no new external call.
- **Constraints:** `blast/routes.ts` stays as it is (AC-49). Every `.it` test that passes `intent: new MockPrIntent()` must still compile (for example `server/test/reviews.it.test.ts:121`). Without `costUsd` in its options, `MockLLMProvider` keeps returning 0.001.
- **Steps:**
  1. Add `get` and `derive` to `PrIntentFacade` with the § Contract signatures. `IntentService` already implements them.
  2. Create `PrBlastFacade`.
  3. Add `ContainerOverrides.prBlast` and `get prBlast()`. The getter builds `{ getBlast, getHistory }` from `new BlastService(this)` and `new PrHistoryService(this)`.
  4. In `mocks.ts`: `MockPrIntent` gains `get` (returns `{ intent: null }`) and `derive` (throws `Error('MockPrIntent.derive not configured')`), both recording calls. Add `MockPrBlast implements PrBlastFacade`, which returns constructor-given results and records calls.
  5. Add `costUsd?: number | null` to `MockLLMOptions`. `complete` and `completeStructured` return `this.opts.costUsd` when the key is present, null included, and 0.001 otherwise.
- **Done when:**
  - `cd server && pnpm typecheck` exits 0.
  - `grep -n "implements PrBlastFacade" server/src/adapters/mocks.ts` prints 1 line, and `grep -n "implements PrIntentFacade" server/src/adapters/mocks.ts` prints 1 line (an existing control).
  - `grep -n "prBlast" server/src/platform/container.ts` prints ≥2 lines.
  - `grep -n "costUsd?: number | null" server/src/adapters/mocks.ts` prints 1 line.
  - `git diff --stat -- server/src/modules/blast/routes.ts` prints nothing.
- **Tests:** see Test brief WP2.tests

### WP3 — The brief module   [server · groups A, B, E]
- **Implements:** R-1–R-17, R-19, R-20, R-21
- **Files:**
  - create `BR/constants.ts`, `BR/helpers.ts`, `BR/prompt.ts`, `BR/model-call.ts`, `BR/repository.ts`, `BR/service.ts`, `BR/routes.ts`
  - modify `server/src/modules/index.ts`
  - modify `server/src/platform/prompt-log.ts`
- **Skills the implementer must apply:**
  - onion-architecture §1 (`prompt-log.ts` is importable from ring ②), §2 (anatomy, docblocks, registration), §3 (literals in `constants.ts`), §4 (`helpers.ts`, `prompt.ts` and `model-call.ts` do no container access; `helpers.ts` has no `await`; the one approved sideways import is GT-1's), §6 (handler = `getContext` + delegate; schema-validated params and response; throw `AppError`s), §7 (`BriefRepository` class holding `this.db`; reads scoped by a join on `pull_requests.workspace_id`; no Drizzle type above the repository), §8 (`PrBrief.safeParse` on stored JSON)
  - fastify-best-practices § Core Principles (schema-first)
  - drizzle-orm-patterns § Best Practices 1 (typed `$inferInsert`), 8 (fetch only the needed column)
  - zod §2 (`parse-use-safeparse`, `parse-never-trust-json` on the stored row)
  - Group E (`BR/routes.ts`, `platform/prompt-log.ts`): security A01 (workspace scoping of both routes), A05 + § Agentic AI Security (every fact inside one `wrapUntrusted` block; the system prompt says the block is data; no tools), A09 (log lines carry no PR, diff or doc text; `prompt: assembled` carries section metadata only).
- **Constraints:**
  - root AGENTS.md (no migration).
  - server/AGENTS.md "New module = `src/modules/<name>/` + register".
  - server/INSIGHTS.md 2026-10-06 (jsonb rejects NUL: let the write fail, do not swallow it).
  - The model is given no tools, and no fetch of anything outside the container ports (NFR-6).
  - The existing `'review'` and `'intent'` log payloads stay byte-for-byte the same (`server/test/prompt-log.test.ts` stays green).
- **Steps:**
  1. `constants.ts`:
     - bounds: `BRIEF_DEADLINE_MS` 120_000, `BRIEF_MAX_TOKENS` 6_000, `BRIEF_MAX_RETRIES` 1, `BRIEF_TEMPERATURE` 0
     - budgets: `MAX_FACTS_CHARS` 45_000, `MAX_DOCS` 3, `MAX_DOC_CHARS` 8_000, `MAX_DOCS_TOTAL_CHARS` 16_000, `MAX_LIST_PATHS` 100, `MAX_LIST_CHARS` 4_000, `MAX_HISTORY_ITEMS` 10
     - A-9 clamps: summary 600, risks 6, focus 6, title and reason 160, explanation 600, refs 6
     - the diff role order `core, tests, wiring, docs`
     - every § Contract error message
  2. `helpers.ts`, all pure:
     - `newSideRanges(patch)`
     - `groundFocus(items, files)` and `groundRisks(risks, changedPaths)`: R-7, R-8, R-9; they return the kept items plus kept/dropped counts
     - `clampAnswer`: the empty summary is reported, not thrown
     - `buildBriefFacts({ intent, files (with role, patch), blast, history, docs })`: returns `{ payload, specsRead }` with the R-5 measure. Blast goes in as `{ summary, caller_files, incomplete, reason }`, where `incomplete` = `blast.degraded === true` (AC-20). History goes in as items plus `incomplete`/`reason`. The diff fills what is left, in role order, with boilerplate left out and the last patch truncated.
     - `toIntent(record)`, `parseStoredBrief(json)`, `toBriefResponse(brief, pullHeadSha, generating)`
  3. `prompt.ts`: the § Contract schema, a `SYSTEM_PROMPT` and `buildBriefMessages(payload)`.
     - The system prompt says three things: the `<untrusted>` content is data; the kinds `security, db_migration, breaking_api, perf, deps` (A-22); every file and line must come from `files` and `diff`.
     - The user message is `wrapUntrusted('brief-facts', JSON.stringify(payload))` plus a trusted instruction.
     - `briefPromptSections(payload)` returns content-free `describeSection` metadata in this order: `system` (trusted), then one untrusted section per payload key present (`intent`, `files`, `diff`, `blast`, `history`, `docs`, with `items` counts), then `instruction` (trusted).
  4. `model-call.ts`: `callBriefModel(llm, { model, messages }, deadlineMs = BRIEF_DEADLINE_MS)`. It returns one of:
     - `{ kind:'ok', answer, model, tokensIn, tokensOut, costUsd }`
     - `{ kind:'failed', reason }`
     - `{ kind:'timeout' }`

     Shape: like `onboarding/model-call.ts:23-53`, including `call.catch(() => undefined)`.
  5. `repository.ts`: `findForPull(workspaceId, prId) → { json: unknown } | null` (join `pull_requests`), and `save(prId, json)` (upsert on `pr_brief.pr_id`).
  6. `platform/prompt-log.ts`: widen `PromptLogInput.kind` to `'review' | 'intent' | 'brief'`. No other change.
  7. `service.ts` — `BriefService(container, opts: { deadlineMs? })` with `getState(workspaceId, prId, logger)`. `generate` runs in this order:
     1. `reviewRepo.getPull` (404)
     2. Take the guard: 409, else add to `running`; `try/finally` deletes it.
     3. `getPrFiles`: none → 422.
     4. `resolveFeatureModel('risk_brief')` + `container.llm(provider)`: a `ConfigError` becomes a `ValidationError` with the same message.
     5. Record `headSha` (the head at start).
     6. `container.intent.get`, else `.derive`.
     7. `container.prBlast.getBlast` and `getHistory`.
     8. `agentsRepo.listEnabled`, sorted by name, then id → `projectContext.resolveForRun` for each agent, with `cloned: repo.clonePath != null` (`reviews/run-executor.ts:241`).
     9. Each file's role from `classifyFile` (GT-1 = A).
     10. Build the facts and the messages.
     11. `logPrompt(logger, { kind:'brief', provider, model, sections: briefPromptSections(payload), totalChars, systemPrompt: SYSTEM_PROMPT }, container.config.promptLog)`.
     12. Call the model: `failed` → `ExternalServiceError('Brief generation failed: ' + reason)`; `timeout` → the timeout message.
     13. Ground and clamp: an empty summary → 502.
     14. Build `PrBrief` with `generation`; `cost_usd` keeps a null as null.
     15. `save`.
     16. Log `brief: generated`; a failure after the guard logs `brief: failed` and rethrows.

     `getState` logs `brief: unreadable` with `{ prId }` when a stored row does not parse.
  8. `routes.ts`: one `BriefService` per app; the GET and POST from § Contract. Register `brief` in `modules/index.ts`.
- **Done when:**
  - `cd server && pnpm typecheck` exits 0.
  - `grep -rnE "drizzle-orm|db/schema" server/src/modules/brief` prints ≥1 line, every one from `repository.ts`.
  - `grep -rnE "from 'fastify" server/src/modules/brief` prints ≥1 line, every one from `routes.ts`.
  - `grep -rnE "from '\.\./[a-z_-]+/" server/src/modules/brief` prints the `../_shared/` imports of `routes.ts` (control: ≥1) and exactly one `service.ts` line naming `reviews/smart-diff/helpers.js`. Nothing else.
  - `grep -n "brief" server/src/modules/index.ts` prints 2 lines.
  - `grep -n "'brief'" server/src/platform/prompt-log.ts` prints 1 line.
  - Its `[T1]` tests pass.
- **Tests:** see Test brief WP3.tests

### WP4 — `GET /pulls/:id` stores the head SHA   [server · groups A, E]
- **Implements:** R-18
- **Files:** modify `server/src/modules/pulls/routes.ts`
- **Skills the implementer must apply:**
  - onion-architecture §11 (`pulls` is a known exception: add the field, refactor nothing)
  - fastify-best-practices § Core Principles
  - Group E: security A08 (the value comes from the authenticated GitHub adapter).
- **Constraints:** add one field to the existing `.set({...})` at `routes.ts:342-349`. The offline `catch` branch is unchanged (AC-54).
- **Steps:** 1. Add `headSha: detail.head_sha` to that update.
- **Done when:**
  - `git diff --numstat -- server/src/modules/pulls/routes.ts` shows 0 deleted lines and ≤3 added lines.
  - Its `[T1]` tests pass.
- **Tests:** see Test brief WP4.tests

### WP5 — Client data layer and wording   [client · groups C, D]
- **Implements:** R-25 (polling), R-30, R-31, R-36
- **Files:**
  - create `client/src/lib/hooks/brief.ts`
  - modify `client/src/lib/hooks/index.ts`
  - modify `client/messages/en/brief.json`
  - modify `client/src/lib/format.ts`
  - modify `client/src/app/repos/[repoId]/tour/helpers.ts`
- **Skills the implementer must apply:**
  - frontend-ui-architecture §6 (generic helper in `lib/format.ts`), §7 tier 3 (all calls in `lib/hooks/*` → `lib/api.ts`), §8 (server data stays in the query cache), §9 (`import type` from `@devdigest/shared`)
  - react-best-practices § Data Fetching
- **Constraints:**
  - client/AGENTS.md: data only via hooks; UI strings in messages.
  - client/INSIGHTS.md 2026-09-19: add JSON keys with targeted edits and check `git diff -- messages/`.
  - client/INSIGHTS.md 2026-10-09: type-only imports from `@devdigest/shared`.
- **Steps:**
  1. `usePrBrief(prId)`: key `["pr-brief", prId]`, `enabled: !!prId`, and `refetchInterval` 5_000 while `data.generating` is true, else false. Same shape as `client/src/lib/hooks/onboarding.ts:12-19`.
  2. `useGeneratePrBrief(prId)`: POST; `onSuccess` sets the `["pr-brief", prId]` data and invalidates `["pr-intent", prId]` (AC-6).
  3. Export both from `hooks/index.ts`.
  4. Add the § Contract keys to `brief.json` and reword `block.risks`.
  5. Add `shortSha(sha)` (7 chars, A-17) to `lib/format.ts`. Make `tour/helpers.ts` re-export it. Delete the tour's `SHORT_SHA_LENGTH` only if `grep -rn SHORT_SHA_LENGTH client/src` then shows no other use.
- **Done when:**
  - `cd client && pnpm typecheck` exits 0.
  - `git diff -- client/messages/en/brief.json` shows only the added keys and the one reworded value.
  - The tour tests stay green: `pnpm exec vitest run tour` reports ≥3 test files and 0 failed.
- **Tests:** see Test brief WP5.tests

### WP6 — VerdictBanner gains optional parts, regenerate and loading   [client · groups C, D]
- **Implements:** R-26, R-34 (footer slot), R-37 (AC-47)
- **Files:** modify `PR/_components/VerdictBanner/VerdictBanner.tsx`, `PR/_components/VerdictBanner/styles.ts`
- **Skills the implementer must apply:**
  - frontend-ui-architecture §4 (no render functions inside the component)
  - react-best-practices § Conditional Rendering (`findingsCount != null`, never `&&` on a number), § Accessibility (the icon-only regenerate button has an `aria-label`)
- **Constraints:**
  - The existing call site `PR/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:101-108` is unchanged and renders as it does today.
  - The props are the § Contract ones.
  - The spinner uses the existing `ddspin` animation (`ReviewRunAccordion.tsx:89`).
- **Steps:**
  1. Make `verdict`, `score`, `findingsCount` and `blockers` optional: a missing `verdict` hides the icon box and the label, and a missing `findingsCount` hides the badge.
  2. Add `loading` (spinner in the score column), `onRegenerate` / `regenerateLabel` / `regenerateDisabled` (IconBtn `RefreshCw`), `provenance` (an Info icon in a `role="img"` span with `aria-label` and `title`), and `footer` under the summary.
- **Done when:**
  - `cd client && pnpm typecheck` exits 0.
  - The existing `VerdictBanner.test.tsx` and `ReviewRunAccordion.test.tsx` pass unchanged.
  - Its `[T1]` tests pass.
- **Tests:** see Test brief WP6.tests

### WP7 — Shared ConfirmDialog; the tour moves to it   [client · groups C, D]
- **Implements:** R-31 (dialog seam), with the tour's behaviour unchanged
- **Files:**
  - create `CD/ConfirmDialog/ConfirmDialog.tsx`, `CD/ConfirmDialog/index.ts`, `CD/ConfirmDialog/styles.ts`, `CD/index.ts`
  - modify `client/src/app/repos/[repoId]/tour/_components/TourView/TourView.tsx`
  - delete `client/src/app/repos/[repoId]/tour/_components/RegenerateDialog/RegenerateDialog.tsx`, `…/RegenerateDialog/index.ts`, `…/RegenerateDialog/styles.ts`
- **Skills the implementer must apply:**
  - frontend-ui-architecture §2 (promote ① → ② on the second consumer; a kebab-case group folder named by domain; no domain knowledge in a level-② component: every label is a prop), §3 (folder anatomy; one-line `index.ts`), §10 (`@/components/confirm-dialog` from both consumers)
  - react-best-practices § Accessibility (Escape path, initial focus), § useEffect Rules (the focus effect synchronises with the DOM)
- **Constraints:**
  - Move the Escape handling and initial focus of `RegenerateDialog.tsx:21-36`, and the body padding of its `styles.ts` (client/INSIGHTS.md 2026-09-22), unchanged.
  - TourView passes `t("confirm.title")`, `t("confirm.body")`, `t("confirm.confirm")` and `t("confirm.cancel")` from the `onboarding` namespace, keeps its own focus-return-on-cancel, and changes nothing else.
  - The tour tests (`tour/page.test.tsx`, `tour/page.toast.test.tsx`) pass unchanged.
- **Steps:**
  1. Create `ConfirmDialog` with the § Contract props.
  2. Replace the import and use at `TourView.tsx:11,162`.
  3. Delete the three `RegenerateDialog` files.
- **Done when:**
  - `cd client && pnpm typecheck` exits 0.
  - `grep -rn "RegenerateDialog" client/src` prints nothing, and `grep -rn "ConfirmDialog" "client/src/app/repos/[repoId]/tour"` prints ≥1 line (the control).
  - `pnpm exec vitest run tour` reports ≥3 test files and 0 failed.
- **Tests:** see Test brief WP7.tests

### WP8 — Overview: PR Brief section, Risk areas, Review focus   [client · groups C, D, Next]
- **Implements:** R-24–R-28, R-30–R-35, R-29 (AC-34, AC-37, AC-38 on the Overview side), R-37 (AC-45, AC-46)
- **Files:**
  - modify `OV/OverviewTab.tsx`, `OV/styles.ts`
  - create `OV/helpers.ts`
  - create `OV/_components/BriefSection/` (`BriefSection.tsx`, `index.ts`, `styles.ts`)
  - create `OV/_components/RiskAreas/` (`RiskAreas.tsx`, `index.ts`, `styles.ts`)
  - create `OV/_components/ReviewFocus/` (`ReviewFocus.tsx`, `index.ts`, `styles.ts`)
  - modify `OV/_components/IntentCard/IntentCard.tsx`
  - create `PR/helpers.ts`
  - modify `PR/page.tsx`
- **Skills the implementer must apply:**
  - frontend-ui-architecture §1, §2 (route-local `_components`; the dialog comes from `@/components/confirm-dialog`), §3 (folder anatomy; one-line `index.ts`; no empty files), §4 (extract the risk row and the focus row), §6 (`OV/helpers.ts` and `PR/helpers.ts` pure: `latestVerdictReview(reviews)` and `withDiffTarget(search, file, line)`), §7, §8 (brief data and generate state in OverviewTab, the nearest common owner; the `children` slot for IntentCard), §10 (`@/` alias; `@devdigest/ui` barrel), §12 (page stays thin)
  - react-best-practices § Derive, Don't Store; § useEffect Rules (the elapsed `setInterval` is cleaned up; no effect for derived state); § Key Prop Patterns (`${file}:${line}` keys); § Conditional Rendering (early returns for empty, loading and error)
  - next-best-practices § Directives (`"use client"` on the new leaves)
- **Constraints:**
  - client/INSIGHTS.md "Recurring Errors" (2026-09-19/20/23): a focus row's `file:line — reason` and the `{seconds} s elapsed` text are each ONE string.
  - NFR-5: model text is rendered only as `{text}`.
  - NFR-11: wording from `brief.json`.
  - AC-45: IntentCard's empty, loading, error, stale and derive branches render as today, with `children` after them; in the loading branch `children` are not rendered.
- **Steps:**
  1. **`OverviewTab`** takes the § Contract props, calls `usePrBrief` and `useGeneratePrBrief`, and lays out the page top to bottom (A-14):
     - BriefSection
     - the existing grid, with IntentCard holding RiskAreas as `children` while a brief exists or a generation is pending or running
     - ReviewFocus under the same condition
     - Description

     **Opening a file:** a file in `changedFiles` → `onOpenFile(file, line)`; any other file → a `role="status"` "File not in this PR's diff" above ReviewFocus (AC-38).
  2. **`BriefSection`** shows one of these states:

     | State | What renders |
     |---|---|
     | No brief, nothing running | EmptyState with the texts and the Generate button (AC-24) |
     | GET failed and no data held | "Could not load the brief." with Retry (AC-43) |
     | Pending or `generating` | VerdictBanner `loading`, `role="status"` "Generating brief…", and "{seconds} s elapsed" only while this page's mutation is pending (AC-25, AC-60, AC-61) |
     | Brief exists | See the list below |

     When a brief exists, VerdictBanner gets:
     - the latest review's verdict, counts, score and agent (A-12)
     - the brief summary, `provenance`, `onRegenerate` (opens the dialog) and `regenerateDisabled` while pending or `generating`
     - a `footer` with "{model} · {cost}", or "{model} · —" for a null cost

     Below the banner, the section shows:
     - the stale marker with `shortSha(generation.head_sha)`
     - the `degraded.*` notices
     - after a failed POST, a `role="alert"` with `generateError`

     The dialog is `ConfirmDialog` with the `brief.confirm.*` labels. Generate sends POST at once (AC-57). Confirm sends POST (AC-41). Cancel or Escape closes the dialog (AC-56).
  3. **`RiskAreas`:**
     - each row shows the title, severity as text and the first ref as a button named `risk.open`
     - a "Why this is a risk" toggle with `aria-expanded` shows the explanation and all refs
     - an empty list shows `noRisks`
     - while pending or `generating`, skeletons
  4. **`ReviewFocus`:**
     - title, count badge, and rows as buttons named `focus.open`, in stored order
     - an empty list shows `focus.empty` with no badge
     - skeletons while pending or `generating`
  5. **IntentCard** accepts `children`.
  6. **`PR/helpers.ts`:** `withDiffTarget` returns the query with `tab=diff`, `file` and, when given, `line`. `page.tsx` passes the following to OverviewTab:
     - `changedFiles={pr.files.map(f => f.path)}`
     - `reviews={runs}`
     - `onOpenFile` = `router.push` of `withDiffTarget`
- **Done when:**
  - `cd client && pnpm typecheck` exits 0.
  - `grep -rn "dangerouslySetInnerHTML" "client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab"` prints nothing. Positive control: `grep -rn "dangerouslySetInnerHTML" client/src | wc -l` gives the same count before and after the change.
  - Its `[T1]` tests pass.
- **Tests:** see Test brief WP8.tests

### WP9 — Files changed deep-link target   [client · groups C, D, Next]
- **Implements:** R-29, R-37 (AC-48)
- **Files:**
  - modify `PR/helpers.ts`, `PR/page.tsx`
  - modify `PR/_components/DiffTab/DiffTab.tsx`, `PR/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx`
  - modify `DV/DiffViewer/DiffViewer.tsx`, `DV/FileCard/FileCard.tsx`, `DV/CodeLine/CodeLine.tsx`, `DV/styles.ts`
- **Skills the implementer must apply:**
  - frontend-ui-architecture §2 (`diff-viewer` is a level-② shared group: new props are optional and generic, with no brief knowledge), §8 (URL state in search params), §10
  - react-best-practices § useEffect Rules (scroll and focus synchronise with the DOM, an external system; run on mount when a target is set), § Accessibility (the focused header gets `tabIndex={-1}`)
  - next-best-practices § Directives
- **Constraints:**
  - Without `target`, every component renders exactly as today (AC-48; `RoleGroup.tsx:23`, `FileCard.tsx:45-47` defaults).
  - client/INSIGHTS.md 2026-10-06: run tests by a file-name fragment, not a bracketed path.
- **Steps:**
  1. `PR/helpers.ts`: `readDiffTarget(search)` returns `{ file, line | null }`, or null when there is no `file`; a non-positive or non-integer `line` becomes null.
  2. `page.tsx` passes `target` to DiffTab, and `setTab` also deletes `file` and `line`.
  3. DiffTab passes `target` to every DiffViewer and RoleGroup. A RoleGroup whose files include `target.file` starts open.
  4. DiffViewer passes `target` to the FileCard whose `path === target.file`.
  5. That FileCard:
     - starts open
     - scrolls the target line's row into view on mount, or the card when that line is not rendered
     - focuses its header
     - passes `highlighted` to the CodeLine where `(kind add|ctx) && newNo === line`
  6. CodeLine with `highlighted` adds the highlight and pulse style and `data-target-line="true"`.
- **Done when:**
  - `cd client && pnpm typecheck` exits 0.
  - `cd client && pnpm build` exits 0 (the value-import trap, client/INSIGHTS.md 2026-10-09).
  - The existing `DiffTab.test.tsx`, `FileCard.test.tsx` and `CodeLine.test.tsx` pass unchanged.
  - Its `[T1]` tests pass.
- **Tests:** see Test brief WP9.tests

## Implementation order
1. WP1, then WP2, then WP3. WP4 has no dependency and can run any time.
2. WP5 after WP1 (types). WP6 and WP7 have no dependency.
3. WP8 needs WP5, WP6 and WP7. WP9 needs WP8, because both edit `PR/page.tsx` and `PR/helpers.ts`.
4. No work package is optional: every one carries spec ACs.

## Acceptance criteria
- [ ] GET `/pulls/:id/brief` answers 200 `{"brief":null,"generating":false,"stale":false}` with no row. With a row it returns that row as `PrBriefResponse`, with zero LLM calls. `stale` is true exactly when `generation.head_sha` ≠ the PR's `head_sha`. (R-1: AC-1, AC-2, AC-3)
- [ ] Both routes give 404 `Pull request not found` for an unknown or other-workspace uuid, and 422 for `abc`. (R-2: AC-4, AC-51)
- [ ] POST with a stored intent makes one `completeStructured` with `schemaName` `PrRiskBrief` on the `risk_brief` model. It returns 200 with `stale:false`. Exactly one `pr_brief` row exists afterwards, with `generation.head_sha` = the PR head. (R-3: AC-5, AC-7)
- [ ] POST with no intent row writes a `pr_intent` row first, and `brief.intent.intent` equals it. (R-4: AC-6)
- [ ] The prompt has exactly one `<untrusted` block, which contains the intent, the files with roles, the diff, the blast summary and callers, the history and the docs. The untrusted JSON is ≤45,000 chars. Of 4 docs, 3 are listed in `specs_read`. A boilerplate patch is absent. `</untrusted>` in the input appears escaped. (R-5: AC-8, NFR-3, NFR-4)
- [ ] A successful POST logs exactly one `prompt: assembled` line with `kind:'brief'`, the provider, the model and section metadata, and none of the facts' text. The existing `'review'` and `'intent'` lines are unchanged. (R-20, decision REC-1)
- [ ] `specs_read` lists each enabled agent's doc once and no doc of a disabled agent. (R-6: AC-9)
- [ ] Grounding and clamps behave as in R-7–R-9: out-of-PR files are dropped; lines outside every hunk are dropped; `src/a.ts:12-18` is stored as `src/a.ts`; 8 risks or 8 focus items become 6; a duplicate `file:line` is kept once. (R-7, R-8, R-9: AC-10–AC-13)
- [ ] Each failure case below returns its status and message, and leaves the stored `pr_brief` row byte-identical (R-10–R-13, R-16: AC-14–AC-17, AC-22, NFR-2):

  | Case | Response |
  |---|---|
  | Blank summary | 502 with the empty-summary message |
  | No key | 422 `OPENAI_API_KEY is not configured`, with 0 LLM calls and no intent row |
  | Intent failure | 502 `Intent derivation failed: …`, with 0 brief calls |
  | Brief failure | 502 `Brief generation failed: …` |
  | No changed files | 422 with the no-files message |
- [ ] `callBriefModel` with an injected 50 ms deadline and an LLM that never answers returns `timeout`, and the service maps that to 502 `Brief generation failed: timed out after 120 s`. Tested in server-unit. (R-13: NFR-1)
- [ ] A second POST during a running one gets 409 with the message, and a GET then returns `generating:true`. (R-14: AC-18, AC-19)
- [ ] With the index flag off, the brief is stored with `blast.degraded:true, reason:"flag_off"` and the prompt contains `flag_off`. With GitHub throwing, it is stored with `history.reason:"github_unavailable"`. (R-15: AC-20, AC-21)
- [ ] A stored `{"x":1}` gives `brief:null` and one warn line `brief: unreadable` with the `prId`. (R-17: AC-23)
- [ ] After `GET /pulls/:id` with GitHub head `new2222`, the PR row's `head_sha` = `new2222` and the intent derived at the old SHA reports `stale:true`. With GitHub failing, `head_sha` is unchanged. (R-18: AC-52, AC-53, AC-54)
- [ ] The brief request carries no `tools`. GitHub calls stay within 20 commit lists and 10 PR summaries. With `MockLLMOptions.costUsd: null`, the stored `cost_usd` is null. (R-19: NFR-6, NFR-7, NFR-8)
- [ ] One `brief: generated` (info) or `brief: failed` (warn) line is logged with the NFR-9 fields, and none of the PR body, diff or doc text. (R-20: NFR-9)
- [ ] The 11th POST in a minute gets 429. (R-21: NFR-12)
- [ ] The twin `brief.ts` files are identical. `git status --porcelain -- server/src/db/migrations server/src/db/schema server/src/db/schema.ts` prints nothing. (R-22: AC-50)
- [ ] The existing intent, blast, history and list-sync/poll `.it` tests pass. (R-23, R-18: AC-49, AC-54)
- [ ] Overview, client side (R-24–R-28, R-30–R-34; ACs listed per bullet):
  - [ ] With no brief: the empty state shows, and "Generate brief" sends one POST with no dialog. (AC-24, AC-57)
  - [ ] While a generation is pending or running: the loading state, the 5 s refetch, and the elapsed counter only for this page's own POST. (AC-25, AC-26, AC-60, AC-61)
  - [ ] The banner with a review and without one. (AC-27, AC-28)
  - [ ] Risk areas, with the expand toggle and the empty text. (AC-29–AC-31)
  - [ ] The Review focus list, and its empty form. (AC-32, AC-33)
  - [ ] The stale marker and no POST on reload. (AC-39, AC-40)
  - [ ] Confirm, Cancel and Escape around refresh, through `ConfirmDialog`. (AC-41, AC-55, AC-56)
  - [ ] The error alert and Retry. (AC-42, AC-43)
  - [ ] The degraded notices. (AC-44)
  - [ ] The model and cost line, with "—" for a null cost. (AC-58, AC-59)
- [ ] `client/src/app/repos/[repoId]/tour/_components/RegenerateDialog/` no longer exists. The tour's regenerate dialog renders through `ConfirmDialog` with its old texts, and `tour/page.test.tsx` and `tour/page.toast.test.tsx` pass unchanged. (R-31, decision REC-2)
- [ ] Focus rows and risk files open `?tab=diff&file=…(&line=…)`. Files changed expands the group and the file, marks the target line `data-target-line="true"` (none when that line is not rendered) and focuses the file header. A file outside the PR shows "File not in this PR's diff" and stays on Overview. The scroll and pulse are a demo. (R-29: AC-34–AC-38, NFR-10)
- [ ] `<img src=x>` in a summary renders as text, with no `img` or `a` element. (R-35: NFR-5)
- [ ] The `brief.json` values equal the spec § Contract text. (R-36: NFR-11)
- [ ] The existing IntentCard, BlastCard, HistoryAccordion, ReviewRunAccordion and DiffTab tests pass, and the Agent runs banner has no refresh button. (R-37: AC-45–AC-48)

## Test plan
| Package | Command | Needs Docker? | Covers |
|---|---|---|---|
| server | `cd server && pnpm typecheck` | no | WP1–WP4 |
| server | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | no | `brief-helpers`, `brief-prompt`, `brief-model-call` (NFR-1), `prompt-log`, `adapters`, contracts |
| server | The keyless recipe from `.claude/agents/README.md` § Running the integration suite without real keys, PLUS `DOTENV_CONFIG_PATH=/dev/null`, for `vitest run brief pulls-head-sha` and then the whole `.it.test`. Tee the output to a log; `grep -a -c x-ratelimit-limit <log>` must print 0. Read failures with `grep -a -E '^ FAIL \|^ +Tests '`. | yes | `brief.it`, `pulls-head-sha.it`, AC-49, AC-54 |
| client | `cd client && pnpm typecheck && pnpm test` (check that "Test Files" > 0) and `pnpm build` | no | WP5–WP9, tour regression |
| repo | `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` | no | AC-50 |
| e2e | `scripts/e2e.sh` with `DOTENV_CONFIG_PATH=/dev/null` and an empty fake HOME; then grep its output for `x-ratelimit-limit`, which must give 0 lines | yes | Flows 02 and 05 open the PR detail and Files changed, and flow 06 covers onboarding; this change edits all three surfaces. Nothing else. |

## Docs to update
- `server/README.md` § API map — add a `brief (L05)` node, `/pulls/:id/brief (GET · POST)`, with arrows to intent, blast and context; extend the `pulls` node label: `GET /pulls/:id` also stores `head_sha`.
- `client/README.md` § UI route map — the PR arrow gains `GET,POST /pulls/:id/brief`; Files changed accepts `?file=&line=`. Name `src/components/confirm-dialog` beside `app-shell` as a shared component group.
- `server/docs/pull-files.md` — `GET /pulls/:id` now also writes `pull_requests.head_sha`; `POST /pulls/:id/brief` returns 422 while `pr_files` is empty.

## Recommendations (not in the plan until you accept them)
None open. REC-1…REC-4 were accepted by the user on 2026-10-09 and are folded into the plan:

| REC | What | Where it now lives |
|---|---|---|
| REC-1 | `'brief'` prompt-log kind | WP3 step 6 and step 7.11 |
| REC-2 | shared `ConfirmDialog` | WP7, used by WP8 |
| REC-3 | NFR-1 tested in server-unit | R-13, WP3.tests |
| REC-4 | `MockLLMOptions.costUsd` | WP2 step 5 |

## Execution mode
- **Decided:** multi-agent (user, 2026-10-09). The deciding facts:
  - two packages (server and client)
  - a shared-contract change
  - group E files: `BR/routes.ts`, `pulls/routes.ts`, `platform/container.ts`, `platform/prompt-log.ts`, `server/src/vendor/shared/**`
  - 9 work packages
- **Multi-agent split:**
  1. test-writer T1 (server `brief.it` and `pulls-head-sha.it`; client OverviewTab, VerdictBanner and DiffTab).
  2. Implementer #1 does WP1 → WP2 → WP3 → WP4 (server, plus the client contract copy). Implementer #2 does WP5 → WP6 → WP7 → WP8 → WP9 (client). #2 can start once WP1 is on disk, because § Contract fixes the types; the two share no files.
  3. test-writer T2.
  4. plan-verifier ∥ architecture-reviewer (tell it GT-1 = A is user-approved) ∥ security-reviewer.
  5. doc-writer.

## Risks & open questions
- **Assumption:** `DOTENV_CONFIG_PATH=/dev/null` stops `import 'dotenv/config'` (`server/src/platform/config.ts:1`) from refilling keys out of `server/.env`. To settle it, grep each fresh `.it` or e2e log for `x-ratelimit-limit`; any hit means a real token was used.
- `GET /pulls/:id` writing `head_sha` also flips the PR list status to `needs_review` sooner (`server/src/modules/pulls/status.ts:144`) and marks the Intent card stale after a push. This is intended (S-13), but it can surprise people. The Summary says so.
- A NUL in history notes or model text makes the jsonb upsert throw, which gives a 500 rather than a 502. The stored brief is unchanged, so A-18 still holds. This follows server/INSIGHTS.md 2026-10-06: fail loudly.
- `OV/OverviewTab.test.tsx` (3 existing cases) renders without a QueryClient and breaks once OverviewTab calls the brief hooks. This is an intended break: T1 wraps those cases in `QueryClientProvider` + `NextIntlClientProvider` with a stubbed `fetch`.
- Moving the tour onto `ConfirmDialog` could change its dialog DOM. The tour tests are the oracle and must pass unchanged; if one fails on a selector rather than on behaviour, the implementer stops and reports it, instead of editing the test.
- jsdom has no `Element.prototype.scrollIntoView`, so tests that set a target must stub it.
- The deep-link target applies when Files changed mounts. A second link while already on Files changed is not a flow here, because the links live on Overview.

<!-- test-brief -->
## Test brief
Server test fixtures:
- A PR row with `head_sha` `old1111`.
- One `pr_files` row, `src/a.ts`, patch `@@ -10,3 +10,4 @@\n ctx10\n+add11\n ctx12\n ctx13`.
- `llm.openai` = `MockLLMProvider` with `structuredBySchema: { PrRiskBrief: { risks:[{kind:'security',title:'T',explanation:'E',severity:'high',file_refs:['src/a.ts:11-12','nope.ts']}], review_focus:[{file:'src/a.ts',line:11,reason:'R'}], summary:'S' } }`.
- `llm.openrouter` = `MockLLMProvider` with `structuredBySchema: { PrIntentClassification: { evidence:[], intent:'Do X', in_scope:[], out_of_scope:[], sources_conflict:false } }`.
- Run `.it` files only through the keyless recipe plus `DOTENV_CONFIG_PATH=/dev/null`.

### WP1.tests
- [T2] Given `PrBrief.parse` on a full brief fixture When `review_focus[0].line` is 0 Then it throws; with line 1 it parses; `PrBriefResponse.parse({brief:null,generating:false,stale:false})` succeeds → `server/test/contracts.test.ts` · `cd server && pnpm exec vitest run contracts`

### WP2.tests
- [T2] Given `new MockPrBlast(blast, history)` When `getBlast` / `getHistory` are called Then they return the given objects and record 1 call each; `new MockPrIntent().get()` resolves to `{intent:null}` → `server/test/adapters.test.ts` · `pnpm exec vitest run adapters`
- [T2] Given `new MockLLMProvider('openai', { costUsd: null, structured: {} })` When `completeStructured` runs on a permissive schema Then `costUsd` is null; with no `costUsd` option it is 0.001 → `adapters.test.ts`

### WP3.tests
- [T1] Given a PR with no `pr_brief` row When `GET /pulls/:id/brief` Then 200 and the body deep-equals `{brief:null,generating:false,stale:false}` → `server/test/brief.it.test.ts` · keyless `vitest run brief` (AC-1)
- [T1] Given a stored `pr_intent` row and the fixtures above When `POST /pulls/:id/brief` Then:
  - 200, `body.brief.summary` = `'S'`, `body.stale` = false, `body.generating` = false
  - `body.brief.review_focus` = `[{file:'src/a.ts',line:11,reason:'R'}]` and `body.brief.risks.risks[0].file_refs` = `['src/a.ts']`
  - the openai mock has 1 `completeStructured` call with `schemaName` `'PrRiskBrief'` and `model` `'gpt-4.1'`; the openrouter mock has 0 calls
  - the `pr_brief` row's `json.generation.head_sha` = `'old1111'`

  → `brief.it.test.ts` (AC-5, AC-7, AC-12)
- [T1] Given the POST above has succeeded When `GET /pulls/:id/brief` Then 200, `body.brief` deep-equals the POST's `body.brief`, and both LLM mocks' call counts are unchanged → `brief.it.test.ts` (AC-2)
- [T1] Given a stored brief When `pull_requests.head_sha` is set to `new2222` and GET is called Then `stale` = true; set back to `old1111` Then `stale` = false → `brief.it.test.ts` (AC-3)
- [T1] Given no `pr_intent` row When POST Then 200, a `pr_intent` row exists with `intent` `'Do X'`, and `body.brief.intent.intent` = `'Do X'` → `brief.it.test.ts` (AC-6)
- [T1] Given two successive POSTs When the rows are counted Then `select count(*) from pr_brief where pr_id = :id` = 1 → `brief.it.test.ts` (AC-7)
- [T2] Given an unknown uuid, and a PR of another workspace When GET and POST Then 404 `Pull request not found`; `id=abc` gives 422 on both → `brief.it.test.ts` (AC-4, AC-51)
- [T2] Given an enabled agent A (doc `docs/x.md`), an enabled agent B (docs `docs/x.md` and `docs/y.md`), and a disabled agent C (doc `docs/z.md`), with MockGitClient serving all three, When POST Then `generation.specs_read` = `['docs/x.md','docs/y.md']`, with agents ordered by name → `brief.it.test.ts` (AC-9)
- [T2] Given focus items `{file:'other.ts',line:1}`, `{file:'src/a.ts',line:50}`, `{file:'src/a.ts',line:12}` (a context line), and a file with `patch:null` When grounded Then only the line-12 item is kept, and the counts report 3 dropped → `server/test/brief-helpers.test.ts` · `pnpm exec vitest run brief-helpers` (AC-10, AC-11)
- [T2] Given `file_refs` `['src/a.ts:12-18','src/a.ts:3','x.ts']` and a risk with refs `[]` When grounded Then the refs are `['src/a.ts']` and the empty risk is kept → `brief-helpers.test.ts` (AC-12)
- [T2] Given 8 risks, 8 focus items (two equal `file:line`), a 700-char summary and a 200-char title When clamped Then 6 risks and 6 focus items in model order, the duplicate appears once, the summary has 600 chars and the title 160 → `brief-helpers.test.ts` (AC-13, A-9)
- [T2] Given the summary fixture `'   '` When POST Then 502 `Brief generation failed: the model returned an empty summary.` and the earlier row is unchanged → `brief.it.test.ts` (AC-14)
- [T2] Given no `llm.openai` override and secrets without `OPENAI_API_KEY` When POST Then 422 `OPENAI_API_KEY is not configured`, 0 LLM calls, and no `pr_intent` row created → `brief.it.test.ts` (AC-15)
- [T2] Given no intent row and an openrouter mock whose `completeStructured` throws When POST Then 502 with a message starting `Intent derivation failed:`, 0 openai calls, and the stored brief unchanged → `brief.it.test.ts` (AC-16)
- [T2] Given a stored brief and an openai mock that throws `boom` When POST Then 502 `Brief generation failed: boom` and the row's json is byte-identical to before → `brief.it.test.ts` (AC-17)
- [T2] Given an LLM whose promise never settles When `callBriefModel(llm, req, 50)` Then `{kind:'timeout'}` within ~50 ms; and the request it passed had `maxTokens` 6000, `maxRetries` 1, and no `tools` key → `server/test/brief-model-call.test.ts` · `pnpm exec vitest run brief-model-call` (NFR-1, NFR-2, NFR-6)
- [T2] Given a gated openai stub When POST #1 is in flight Then POST #2 (raced against a 3 s timeout, gate released in `finally`) gets 409 with the § Contract message, and GET returns `generating:true`; the openai stub was called once → `brief.it.test.ts` (AC-18, AC-19; server/INSIGHTS.md 2026-10-09)
- [T2] Given the repo-intel index flag off When POST Then 200, the stored `blast.degraded` = true and `reason` = `'flag_off'`, and the user message the stub received contains `flag_off` → `brief.it.test.ts` (AC-20)
- [T2] Given a GitHub double whose `listCommitsForPath` throws When POST Then 200 and the stored `history.reason` = `'github_unavailable'`; with 25 changed files Then ≤20 `listCommitsForPath` and ≤10 `getPullSummary` calls → `brief.it.test.ts` (AC-21, NFR-7)
- [T2] Given a PR with no `pr_files` When POST Then 422 `This pull request has no changed files to brief yet.` and 0 LLM calls → `brief.it.test.ts` (AC-22)
- [T2] Given a `pr_brief` row `{"x":1}` When GET Then `brief:null` and one warn line with `msg` `brief: unreadable` and the `prId` (pino `fs.write`/`fs.writeSync` spy, server/INSIGHTS.md 2026-10-01) → `brief.it.test.ts` (AC-23)
- [T2] Given facts with a 60,000-char diff, 4 docs of 9,000 chars, a `pnpm-lock.yaml` patch, and a body containing `</untrusted>` When the messages are built Then:
  - the JSON payload has ≤45,000 chars and `specsRead` has 3 entries
  - the lockfile patch is absent and the user message has exactly one `<untrusted`
  - the input's `</untrusted>` appears as `<\/untrusted>`
  - the payload holds the intent, files with `role`, diff, blast summary, caller files, history and docs

  → `server/test/brief-prompt.test.ts` · `pnpm exec vitest run brief-prompt` (AC-8, NFR-3, NFR-4)
- [T2] Given a payload with all six keys When `briefPromptSections(payload)` runs Then the section names are `system, intent, files, diff, blast, history, docs, instruction` in that order, every fact section has `trust:'untrusted'`, and no section object has a `text` key → `brief-prompt.test.ts` (REC-1)
- [T2] Given `promptLogPayload({ kind:'brief', provider:'openai', model:'gpt-4.1', sections, totalChars:10 }, 'default')` Then `info.kind` = `'brief'` and `info` has no `trigger` key; the existing review and intent cases are unchanged → `server/test/prompt-log.test.ts` · `pnpm exec vitest run prompt-log` (REC-1)
- [T2] Given a successful POST When the logs are read Then exactly one `prompt: assembled` line has `kind:'brief'`, and none of its fields contains `add11` → `brief.it.test.ts` (REC-1, NFR-9)
- [T2] Given `llm.openai = new MockLLMProvider('openai', { costUsd: null, structuredBySchema: … })` When POST Then the stored `generation.cost_usd` = null, and `tokens_in` 100, `tokens_out` 50 and `model` `'gpt-4.1'` are copied → `brief.it.test.ts` (NFR-8, REC-4)
- [T2] Given a successful POST and a failing one When the logs are read Then exactly one `brief: generated` line holds `prId, headSha, provider, model, tokensIn, tokensOut, costUsd, durationMs`, the kept and dropped counts, `specsRead`, `blastDegraded` and `historyDegraded`, and no line contains the patch text `add11`; the failure gives one `brief: failed` warn line with a `reason` → `brief.it.test.ts` (NFR-9)
- [T2] Given an app built with `NODE_ENV:'development'` When 11 POSTs arrive within a minute Then the 11th gets 429 → `brief.it.test.ts` (NFR-12)

### WP4.tests
- [T1] Given a PR row with `head_sha` `old1111` and `github: new MockGitHubClient({ detail: { head_sha: 'new2222' } })` When `GET /pulls/:id` Then 200 and the DB `pull_requests.head_sha` = `'new2222'` → `server/test/pulls-head-sha.it.test.ts` · keyless `vitest run pulls-head-sha` (AC-52)
- [T1] Given a `pr_intent` row derived at `old1111` When `GET /pulls/:id` and then `GET /pulls/:id/intent` Then `body.intent.stale` = true → `pulls-head-sha.it.test.ts` (AC-53)
- [T2] Given a GitHub double whose `getPullRequest` throws When `GET /pulls/:id` Then 200 with the stored detail and `head_sha` still `'old1111'`; the existing list-sync and polling `.it` tests pass → `pulls-head-sha.it.test.ts` (AC-54)

### WP5.tests
- [T2] Given `GET /pulls/p1/brief` returning `generating:true` and then `false` When `usePrBrief('p1')` is rendered with fake timers (`shouldAdvanceTime: true`) and advanced 5 s Then a second GET is sent; after `false`, a further 5 s sends none → `client/src/lib/hooks/brief.test.tsx` · `cd client && pnpm exec vitest run hooks/brief` (AC-26)
- [T2] Given `brief.json` When each spec § Contract key is looked up Then it equals the spec text character for character, and `block.risks` = "Risk areas" → `PR/brief-messages.test.ts` · `pnpm exec vitest run brief-messages` (NFR-11)
- [T2] Given `shortSha('abcdef0123')` Then `'abcdef0'`, and the tour still renders its 7-char SHA → `client/src/lib/format.test.ts` · `pnpm exec vitest run format` (A-17)

### WP6.tests
- [T1] Given `<VerdictBanner summary="S" onRegenerate={fn} regenerateLabel="Re-run the brief for this PR" />` with no verdict, score or counts Then the text "S" and the button named "Re-run the brief for this PR" render, and none of "Request changes", "Approve", "Comment", "findings" or "PR SCORE" renders → `PR/_components/VerdictBanner/VerdictBanner.test.tsx` · `pnpm exec vitest run VerdictBanner` (AC-28)
- [T2] Given `loading` Then no score is rendered and a spinner is; given `provenance="P"` Then `getByLabelText("P")` exists; given `footer={<span>F</span>}` Then "F" follows the summary → `VerdictBanner.test.tsx` (AC-25, AC-27)
- [T2] Given the Agent runs accordion with a verdict review Then the banner shows the verdict and the score, and no button named "Re-run the brief for this PR" → `PR/_components/ReviewRunAccordion/ReviewRunAccordion.test.tsx` · `pnpm exec vitest run ReviewRunAccordion` (AC-47)

### WP7.tests
- [T2] Given `<ConfirmDialog title="T" body="B" confirmLabel="Yes" cancelLabel="No" onConfirm={c} onCancel={x} />` Then a dialog titled "T" shows "B", "Yes" and "No", and `document.activeElement` is the "Yes" button; clicking "Yes" calls `c` once; clicking "No" or pressing Escape calls `x` once → `CD/ConfirmDialog/ConfirmDialog.test.tsx` · `pnpm exec vitest run ConfirmDialog` (AC-55, AC-56)
- [T2] Given the tour's existing regenerate-dialog cases Then they pass unchanged against the new dialog → `client/src/app/repos/[repoId]/tour/page.test.tsx` · `pnpm exec vitest run tour` (REC-2 regression)

### WP8.tests
Render `OverviewTab` with real hooks inside `QueryClientProvider` + `NextIntlClientProvider` (the `brief`, `intent`, `blast`, `prReview`, `common` and `shell` messages) over a stubbed `fetch` keyed `"METHOD /path"`, as `client/src/app/repos/[repoId]/tour/page.test.tsx` does. Stub `GET /pulls/p1/intent`, `/blast` and `/history`. Props: `changedFiles=['src/a.ts']`, `reviews=[]` unless stated, `onOpenFile=vi.fn()`. Brief fixture: summary `S`, a risk `{title:'T',severity:'high',file_refs:['src/a.ts'],explanation:'E'}`, focus `[{file:'src/a.ts',line:12,reason:'R'},{file:'gone.ts',line:3,reason:'Q'}]`, generation `{head_sha:'abcdef0123', model:'gpt-4.1', cost_usd:0.0123, …}`. First wrap the 3 existing cases in the providers so they keep passing.
- [T1] Given GET returns `{brief:null,generating:false,stale:false}` Then "PR Brief", "No brief yet", "Generate a Why+Risk brief for this PR." and the button "Generate brief" render → `OV/OverviewTab.test.tsx` · `pnpm exec vitest run OverviewTab` (AC-24)
- [T1] Given the empty state When "Generate brief" is clicked Then exactly one `POST /pulls/p1/brief` is sent, and "Replace this brief?" is absent → `OverviewTab.test.tsx` (AC-57)
- [T1] Given GET returns the fixture brief When the page settles Then "S" renders and 0 POST requests were sent → `OverviewTab.test.tsx` (AC-40)
- [T1] Given the fixture and `reviews=[{verdict:'request_changes', score:42, agent_name:'Security Reviewer', findings:[a CRITICAL with no dismissed_at, a WARNING]}]` Then "Request changes", "2 findings · 1 blockers", "42", "Security Reviewer" and "S" render → `OverviewTab.test.tsx` (AC-27)
- [T1] Given the fixture Then "Risk areas", "T", "High", and a button named "Open src/a.ts in Files changed" render → `OverviewTab.test.tsx` (AC-29)
- [T1] Given the fixture Then "Review focus — read these first", a badge "2", and buttons named "Open src/a.ts:12 in Files changed" and "Open gone.ts:3 in Files changed" render in that order, the first showing the text "src/a.ts:12 — R" → `OverviewTab.test.tsx` (AC-32, NFR-10)
- [T1] Given the fixture When the `src/a.ts:12` row is clicked Then `onOpenFile` is called with `('src/a.ts', 12)`; When the risk file button is clicked Then it is called with `('src/a.ts', null)` → `OverviewTab.test.tsx` (AC-34, AC-37)
- [T1] Given GET with `stale:true` Then "Generated for abcdef0 — there are new commits" renders, "S" is still shown, and 0 POSTs are sent → `OverviewTab.test.tsx` (AC-39)
- [T1] Given the fixture When the refresh button "Re-run the brief for this PR" is clicked Then a dialog titled "Replace this brief?" with "Regenerating makes one model call on your API key and replaces the current brief.", "Regenerate" and "Cancel" opens, and 0 POSTs are sent; When "Regenerate" is clicked Then 1 POST is sent and its returned summary "S2" replaces "S" → `OverviewTab.test.tsx` (AC-55, AC-41)
- [T1] Given the fixture Then "gpt-4.1 · $0.01" renders → `OverviewTab.test.tsx` (AC-58)
- [T2] Given the dialog is open When "Cancel" is clicked, or Escape is pressed Then the dialog closes and 0 POSTs are sent → `OverviewTab.test.tsx` (AC-56)
- [T2] Given `cost_usd:null` Then "gpt-4.1 · —" renders and no text matches `/\$0/` → `OverviewTab.test.tsx` (AC-59)
- [T2] Given a pending POST (an unresolved promise) and fake timers advanced 3 s Then `role="status"` "Generating brief…" renders, "3 s elapsed" renders, skeletons replace Risk areas and Review focus, and the refresh button is disabled → `OverviewTab.test.tsx` (AC-25, AC-60)
- [T2] Given GET `generating:true` and no POST from the page Then the loading state renders and no text matches `/elapsed/` → `OverviewTab.test.tsx` (AC-61)
- [T2] Given POST answers 502 `{error:{message:'Brief generation failed: boom'}}` Then a `role="alert"` reads "Could not generate the brief: Brief generation failed: boom" and the previous "S" (or the empty state) is still rendered → `OverviewTab.test.tsx` (AC-42)
- [T2] Given GET answers 500 with no cached data Then "Could not load the brief." and "Retry" render, and Retry sends a second GET; given a failed refetch with cached data, "S" is still rendered → `OverviewTab.test.tsx` (AC-43; client/INSIGHTS.md 2026-10-02)
- [T2] Given `blast:{…,degraded:true,reason:'flag_off'}` Then "Blast radius was incomplete when this brief was written (flag_off)." renders; the `history` reason gives the history notice → `OverviewTab.test.tsx` (AC-44)
- [T2] Given a risk When "Why this is a risk" is clicked Then "E" and every ref render and the control has `aria-expanded="true"`; given `risks:[]` Then "No notable risks flagged." renders; given a risk with `file_refs:[]` Then it shows no file button → `OverviewTab.test.tsx` (AC-29, AC-30, AC-31)
- [T2] Given `review_focus:[]` Then the heading and "No review focus items" render, with no count badge → `OverviewTab.test.tsx` (AC-33)
- [T2] Given the `gone.ts:3` row is clicked Then `onOpenFile` is not called and "File not in this PR's diff" renders → `OverviewTab.test.tsx` (AC-38)
- [T2] Given summary `<img src=x> [a](http://x)` Then that literal text renders, and the section holds no `img` and no `a` element → `OverviewTab.test.tsx` (NFR-5)
- [T2] Given `withDiffTarget('tab=overview&trace=r1', 'src/a b.ts', 12)` Then the query has `tab=diff`, `file=src%2Fa%20b.ts` (or the URLSearchParams form `src%2Fa+b.ts`) and `line=12`; with `null` it has no `line` → `PR/helpers.test.ts` · `pnpm exec vitest run "pulls/\[number\]/helpers"`, checking the Test Files count (AC-34, AC-37)
- [T2] Given IntentCard with a brief child and `GET /pulls/p1/intent` → `{intent:null}` Then the Derive empty state still renders, followed by the child; the existing `IntentCard.test.tsx`, `BlastCard.test.tsx` and `HistoryAccordion.test.tsx` pass → `OV/_components/IntentCard/IntentCard.test.tsx` · `pnpm exec vitest run IntentCard BlastCard HistoryAccordion` (AC-45, AC-46)

### WP9.tests
- [T1] Given DiffTab (with `@/lib/hooks/reviews` mocked as in the existing file) whose smart diff puts `docs/guide.md` in the `docs` group (collapsed by default), and `target={file:'docs/guide.md', line:null}` Then the group's header has `aria-expanded="true"` and the file's patch lines render → `PR/_components/DiffTab/DiffTab.test.tsx` · `pnpm exec vitest run DiffTab` (AC-34)
- [T1] Given the same setup with `target={file:'src/a.ts', line:11}` where line 11 is an added line Then exactly one element has `data-target-line="true"` and it contains `add11` → `DiffTab.test.tsx` (AC-35 highlight)
- [T2] Given `target={file:'src/a.ts', line:99}` (not rendered) Then the file is expanded and no element has `data-target-line` → `DiffTab.test.tsx` (AC-36)
- [T2] Given no `target` Then the role groups, the collapse defaults and the order toggle are as in the existing cases → `DiffTab.test.tsx` (AC-48)
- [T2] Given a FileCard for a large file (closed by default) with `target={line:11}` and a stubbed `scrollIntoView` Then the card is open, `scrollIntoView` was called, and `document.activeElement` is the header containing the path → `DV/FileCard/FileCard.test.tsx` · `pnpm exec vitest run FileCard` (AC-34, NFR-10)
- [T2] Given `readDiffTarget('tab=diff&file=src%2Fa.ts&line=12')` Then `{file:'src/a.ts', line:12}`; given `line=0` or `line=x` Then `line:null`; given no `file` Then null → `PR/helpers.test.ts` (AC-34, AC-36)
