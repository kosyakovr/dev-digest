# Risk Brief — what a PR does, why, and where to look first

**Status:** approved
**Lesson / ticket:** L05
**Packages:** server, client, and both vendored `@devdigest/shared` copies (reviewer-core, mcp-server and e2e unchanged)

## Goal
A reviewer who opens a PR has the facts in separate cards (Intent, Blast radius, Prior PRs) but nothing that says in a few lines what the change does, why, which areas are risky and which lines to read first (S-1, S-4). The Risk Brief collects those facts without a model — the intent, the changed files and hunks, the blast radius, the PR history and the specs attached to the active agents — and one structured model call writes the brief over them (S-4). It is generated only when the user asks, stored per PR, shown again without a new call, and marked stale after new commits (S-1, S-2). Every file and line it points at is checked against the PR's own diff, so a link from the brief always lands inside Files changed (request).

## Non-goals
- No automatic generation: not on PR open, not after a review, not on a new commit (S-2 answer 1).
- No migration and no change to the database schema: the brief lives in the existing `pr_brief` row (S-1, S-5).
- No history of earlier briefs: one brief per PR, the latest replaces the previous one (S-5: `pr_id` is the key).
- No MCP tool for the brief (P-3 rejected, user · 2026-10-09; S-13).
- The design's single "BriefCard" that redraws Intent and Blast radius inside itself is not built; the existing Intent and Blast radius cards stay and the brief adds to them (origin: design S-3 `BriefCard`; A-14).
- The design's review cost badge inside VerdictBanner (`$` and tokens) is not shown on Overview (origin: design S-3 `findings.jsx:130-132`).
- The brief never reaches a reviewer agent's prompt and never filters, drops or downgrades a finding (inferred; same invariant as S-6).
- A stale intent is not re-derived for the brief (A-11).

## Sources
| ID | Source | What it contributes |
|---|---|---|
| S-1 | request — user text, 2026-10-09 (translated from Ukrainian), saved at `<scratchpad>/design/request.md` | Location (PR Brief section, Risk areas in the Intent panel, Review focus panel); the six stories; the fact sources; `summary` + `review_focus[{file,line,reason}]` in both `brief.ts`; cache in `pr_brief` with the SHA inside the JSON; `completeStructured`; `risk_brief` model; VerdictBanner reuse; `brief.json` labels |
| S-2 | request — user decisions, 2026-10-09 (§ "The user's answers") | 1 stale marker on a SHA mismatch, no auto-regeneration; 2 banner without a review shows summary + refresh only; 3 derive Intent first; 4 history in the facts and in the stored brief, with the accordion |
| S-3 | design — Claude Design UI prototype https://claude.ai/artifact/949i8C4dnLUJnpsZFg4NHt, decoded at `<scratchpad>/design/ui/`: `screen_pr_detail.jsx:3-192,212-224`, `findings.jsx:103-133`, `diff.jsx:83-110`, `data.jsx:19-62`, `blast.jsx` | Empty state ("No brief yet", "Generate a Why+Risk brief for this PR.", "Generate brief"); loading = banner spinner + skeletons; Intent + "Risk areas" pills with severity, file and an expandable "why"; "Review focus — read these first" with a count and `file:line — reason` rows in reading order; banner provenance tooltip and regenerate button; deep-link expands, scrolls and pulses the line; "File not in this PR's diff" notice; sample risk kinds |
| S-4 | design — "DevDigest Field Manual" https://claude.ai/artifact/7WfoegJ395FEWoqsZ9KykV, saved at `<scratchpad>/design/eng-review.txt:539-541` | "what changed, why, and where to look first"; facts collected deterministically, the model only writes over them |
| S-5 | existing — `server/src/vendor/shared/contracts/brief.ts:8-152` (Intent, BlastRadius, Risk, PrHistory, `PrBrief`; byte-identical to `client/src/vendor/shared/contracts/brief.ts`); `server/src/db/schema/reviews.ts:74-79` (`pr_brief`: `pr_id` PK, `json` jsonb; no writer); `contracts/platform.ts:61-66` (`risk_brief`, default `openai` / `gpt-4.1`); `server/src/modules/settings/feature-models.ts` (`resolveFeatureModel`); no `PrBrief` reader or fixture in `server/test` or `client/src` | What exists to extend |
| S-6 | existing — `server/src/modules/intent/routes.ts:27-38` (synchronous POST, rate limit 10/min); `intent/service.ts:57-93` (`stale` = stored SHA ≠ PR head; missing key → 422 with the provider's message; model failure → 502 `Intent derivation failed: …`); `intent/constants.ts` (≤3 specs, 8,000 / 16,000 chars; ≤100 paths, 4,000 chars; ~45k total; clamps 300 / 6 / 160); `intent/prompt.ts:107-118` (sources as JSON inside one `<untrusted>` block); specs/L03-intent-layer.md | Route, error and prompt precedent |
| S-7 | existing — `server/src/modules/onboarding/routes.ts:29-38` (synchronous generate), `onboarding/service.ts:76` (in-process guard → 409), `onboarding/constants.ts:7-11` (120 s deadline, `maxTokens` 6,000, `maxRetries` 1), `contracts/knowledge.ts:90-95` (`generating` flag), `client/src/lib/hooks/onboarding.ts:9,17` (5 s poll); specs/L05-onboarding-tour.md S-9 (a failed regenerate keeps the stored result, 502) | Generation, concurrency and failure precedent |
| S-8 | existing — `server/src/modules/blast/service.ts:17-49` (`getBlast`, never throws on index state); `blast/constants.ts:8,10` (history ≤20 files, ≤10 PRs); specs/L04-blast-radius.md (`degraded` / `reason`, `github_unavailable` / `github_partial`); `client/…/OverviewTab/_components/BlastCard/BlastCard.tsx:92` (the "Prior PRs touching these files" accordion already renders under Blast radius) | Blast and history facts and states |
| S-9 | existing — `server/src/modules/context/service.ts:196` (`resolveForRun`: an agent's own docs then its skills' docs, read at the clone HEAD, 200,000-byte cap, never throws); `server/src/db/schema/agents.ts:43` (`enabled`); `server/src/modules/reviews/service.ts:52` ("Run all" = `listEnabled`); server/docs/project-context.md | "Specs attached to active agents" |
| S-10 | existing — `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:62-70` (tab in `?tab=`, keys `overview` / `findings` / `diff`), `_components/OverviewTab/OverviewTab.tsx` (IntentCard + BlastCard + Description), `_components/VerdictBanner/VerdictBanner.tsx:12-60` (verdict required; no regenerate or loading), `_components/ReviewRunAccordion/ReviewRunAccordion.tsx:56,138-147` (banner usage, blockers = undismissed CRITICAL), `client/src/components/diff-viewer/FileCard/FileCard.tsx:45` and `DiffTab/_components/RoleGroup/RoleGroup.tsx:23` (no file or line anchor; files and docs/boilerplate groups start collapsed); `client/messages/en/brief.json` (unused today); `client/src/app/repos/[repoId]/tour/helpers.ts:7` (`shortSha`) | Client surface today |
| S-11 | existing — `reviewer-core/src/prompt.ts:17-35` (`INJECTION_GUARD`, `wrapUntrusted` escapes `</untrusted>`); docs/shared-contracts.md § Cost fields (null = unknown); server/docs/pull-files.md (`pr_files` written only by `GET /pulls/:id`); `server/src/modules/pulls/routes.ts:340-350` (`GET /pulls/:id` refreshes files but not `head_sha`); reviewer-core/docs/llm-token-budget.md | Untrusted-data, cost and freshness traps |
| S-12 | existing — `server/src/modules/reviews/smart-diff/helpers.ts:76` (`classifyFile`: core, tests, wiring, docs, boilerplate); specs/L03-smart-diff.md | Role of each changed file |
| S-13 | request — user decisions, resolution round, 2026-10-09 | Fix the `head_sha` lag: `GET /pulls/:id` writes `head_sha` in the update it already makes; P-1, P-2, P-4, P-5 accepted; P-3 rejected |

## User stories
### US-1 — Generate a brief on demand (P1)
As a reviewer, I want to press "Generate brief" on a PR's Overview and get a summary, risk areas and a review focus list, so that I know what to read first.
**Independent test:** on a PR with changed files and no brief, press Generate brief. The banner shows the summary; Risk areas and Review focus render; the stored row exists.

### US-2 — Read the brief next to the facts (P1)
As a reviewer, I want the summary in the banner, the risks inside the Intent panel and the focus list below, next to the existing Intent and Blast radius cards, so that I read one screen.
**Independent test:** with a stored brief and a finished review, the banner shows the review's verdict, findings and score with the brief's summary; without a review it shows the summary and refresh only.

### US-3 — Jump from the brief to the code (P1)
As a reviewer, I want a Review focus item or a risk's file to open Files changed at that file and line, so that I do not search for it.
**Independent test:** activate a focus item `src/a.ts:12`. The Files changed tab opens with `src/a.ts` expanded and line 12 in view and highlighted.

### US-4 — See the same brief after a reload, and know when it is stale (P1)
As a reviewer, I want a reload to show the stored brief without a new call, and a marker when new commits arrived, so that I neither pay twice nor trust an old brief.
**Independent test:** generate, reload: no POST is sent and the same brief shows. Move the PR head: the marker "Generated for <sha> — there are new commits" appears and the brief stays.

### US-5 — Regenerate (P2)
As a reviewer, I want a refresh button that writes the brief again, so that I can update it after new commits.
**Independent test:** press refresh on a stale brief; the new brief replaces it and the marker disappears. Make the model fail; the old brief stays and an error shows.

### US-6 — An honest status when a fact or the model fails (P1)
As a reviewer, I want to see which facts were missing and why a generation failed, so that I know how far to trust the brief.
**Independent test:** with the repo index off, generate: the brief is stored and the page names the incomplete blast radius. Without the `risk_brief` key, generate: 422 with the key's name and no model call.

## Contract
- **Routes** (workspace-scoped; non-uuid `:id` → 422; unknown or other-workspace PR → 404 `Pull request not found`):
  - `GET /pulls/:id/brief` → 200 `PrBriefResponse`. Reads the stored brief; never calls a model, GitHub or the index.
  - `POST /pulls/:id/brief` (no body) → 200 `PrBriefResponse` with the new brief, after it is stored. **Synchronous**, like `POST /pulls/:id/intent` and `POST /repos/:id/tour/generate` (S-6, S-7; A-1). Rate limit 10 / minute (A-21). Errors: 409 `A brief is already being generated for this pull request.` · 422 `<PROVIDER>_API_KEY is not configured` (the provider's existing message) · 422 `This pull request has no changed files to brief yet.` · 502 `Intent derivation failed: <reason>` · 502 `Brief generation failed: <reason>`. Every error leaves the stored brief unchanged.
- **Shared contracts** — `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`, changed together and byte-identical (S-1, S-5). New fields are required: nothing reads or fixtures `PrBrief` today (A-24).
  ```ts
  export const ReviewFocusItem = z.object({ file: z.string(), line: z.number().int().min(1), reason: z.string() });
  export const PrBriefGeneration = z.object({
    head_sha: z.string(),            // the PR head SHA the brief was generated for
    generated_at: z.string(),        // ISO 8601
    provider: z.string(), model: z.string(),
    tokens_in: z.number().int(), tokens_out: z.number().int(),
    cost_usd: z.number().nullable(), // null = unknown, never 0 (S-11)
    specs_read: z.array(z.string()), // doc paths whose text was in the prompt, in prompt order
  });
  PrBrief = { intent, blast, risks, history,   // unchanged members
              summary: z.string(), review_focus: z.array(ReviewFocusItem), generation: PrBriefGeneration }
  export const PrBriefResponse = z.object({ brief: PrBrief.nullable(), generating: z.boolean(), stale: z.boolean() });
  ```
  `Risk.file_refs` stays `string[]`; each stored entry is a changed-file path (A-8).
  - `GET /pulls/:id` (existing, changed): when it refreshes the PR from GitHub it also stores GitHub's head SHA as the PR's `head_sha`. The response shape is unchanged (S-13).
- **MCP tools:** none.
- **UI surface** — PR page → Overview (A-14): a "PR Brief" section on top (empty state, or VerdictBanner with the stale marker and degraded notices); the existing Intent card gains a "Risk areas" subsection; a "Review focus — read these first" panel below the Intent | Blast radius row; Description stays last. **VerdictBanner** (existing) gains: verdict, findings and score become optional; a regenerate action with its label; a loading state that shows a spinner in place of the score. Files changed accepts a target file and optional line, carried in the page query `?tab=diff&file=<path>&line=<n>` (A-15).
- **Wording** — `client/messages/en/brief.json`: reword `block.risks` "Risks" → "Risk areas"; add `section` "PR Brief", `empty.title` "No brief yet", `empty.body` "Generate a Why+Risk brief for this PR.", `generate` "Generate brief", `generating` "Generating brief…", `regenerate` "Re-run the brief for this PR", `stale` "Generated for {sha} — there are new commits", `provenance` "Verdict, findings and score come from the latest agent review; what / why / risks / review-focus come from the brief.", `focus.title` "Review focus — read these first", `focus.open` "Open {file}:{line} in Files changed", `risk.open` "Open {file} in Files changed", `risk.why` "Why this is a risk", `severity.high` "High", `severity.medium` "Medium", `severity.low` "Low", `notInDiff` "File not in this PR's diff", `degraded.blast` "Blast radius was incomplete when this brief was written ({reason}).", `degraded.history` "PR history was incomplete when this brief was written ({reason}).", `focus.empty` "No review focus items", `meta` "{model} · {cost}", `costUnknown` "—", `elapsed` "{seconds} s elapsed", `confirm.title` "Replace this brief?", `confirm.body` "Regenerating makes one model call on your API key and replaces the current brief.", `confirm.confirm` "Regenerate", `confirm.cancel` "Cancel", `loadError` "Could not load the brief.", `retry` "Retry", `generateError` "Could not generate the brief: {message}" (S-3, A-23).
- **Persistence:** the whole `PrBrief`, `generation` included, in the existing `pr_brief.json`, one row per PR, overwritten. No new table or column, so no migration gate (S-1).

### Module interaction
```mermaid
sequenceDiagram
  participant UI as PR page (Overview)
  participant API as server · POST /pulls/:id/brief
  participant IN as Intent Layer
  participant BL as blast + history
  participant CX as project context
  participant LLM as risk_brief model
  UI->>API: POST (no body)
  API->>API: guard (409) · PR + changed files (404 / 422) · risk_brief key (422)
  API->>IN: stored intent, else derive on review_intent (502 / 422 on failure)
  API->>BL: blast radius (degraded, never fails) · history (GitHub; degraded on failure)
  API->>CX: docs of enabled agents (skipped docs, never fails)
  API->>LLM: one structured call over the facts (502 on failure / deadline)
  API->>API: ground files and lines · clamp · store pr_brief
  API-->>UI: 200 PrBriefResponse
  UI->>UI: Files changed ?tab=diff&file&line on a click
```

## Acceptance criteria
- **AC-1** (US-4 · S-1) WHEN `GET /pulls/:id/brief` is called for a PR with no stored brief, the server SHALL return 200 `{"brief":null,"generating":false,"stale":false}`.
- **AC-2** (US-4 · S-1) WHEN `GET /pulls/:id/brief` is called for a PR with a stored brief, the server SHALL return it as `PrBriefResponse` and make no model, GitHub or index call.
- **AC-3** (US-4 · S-2) WHILE the stored `generation.head_sha` differs from the PR's head SHA, `GET /pulls/:id/brief` SHALL return `stale: true` (A-3).
- **AC-4** (US-1 · S-6) IF the PR is unknown or in another workspace, THEN both brief routes SHALL return 404 `Pull request not found`.
- **AC-51** (US-1 · S-6) IF `:id` is not a uuid, THEN both brief routes SHALL return 422.
- **AC-5** (US-1 · S-1) WHEN `POST /pulls/:id/brief` is called for a PR with a stored intent, the server SHALL make one structured call on the `risk_brief` feature model and return 200 with the stored new brief and `stale: false`.
- **AC-6** (US-1 · S-2) WHEN `POST /pulls/:id/brief` is called for a PR with no stored intent, the server SHALL derive and store the intent on the `review_intent` model before the brief call, and the brief's `intent` SHALL equal it.
- **AC-7** (US-1 · S-1) WHEN a brief is stored, the server SHALL write it to the PR's `pr_brief` row, replacing any earlier one, with `generation.head_sha` = the PR head SHA read when generation started.
- **AC-8** (US-1 · S-1) WHEN the brief call is made, its prompt SHALL contain the intent, every changed file with additions, deletions and Smart Diff role, the diff text, the blast summary and caller files, the PR history items and the attached docs, within NFR-3.
- **AC-9** (US-1 · A-4, A-28) WHEN the docs are gathered, the server SHALL take the docs attached to every enabled agent of the workspace (own and inherited through skills), in A-28's order, each path once at its first appearance, and SHALL record the paths whose text entered the prompt in `generation.specs_read`.
- **AC-10** (US-3 · A-7) IF a `review_focus` item's file is not among the PR's changed files, THEN the server SHALL drop the item.
- **AC-11** (US-3 · A-7, A-30) IF a `review_focus` item's line is not on the new side of one of that file's diff hunks as A-30 defines it (or the file has no patch), THEN the server SHALL drop the item.
- **AC-12** (US-3 · A-8) WHEN risks are stored, the server SHALL keep a `file_refs` entry only if its path, after removing a trailing `:<n>` or `:<n>-<m>`, equals a changed file, store that bare path once, and keep a risk whose list ends empty.
- **AC-13** (US-2 · A-9, A-31) WHEN the model's answer is stored, the server SHALL ground it, then drop a repeated focus `file:line`, then clamp it to A-9's limits, keeping the model's order of risks and focus items.
- **AC-14** (US-6 · A-9) IF the summary is empty after trimming, THEN the server SHALL return 502 `Brief generation failed: the model returned an empty summary.` and keep the stored brief.
- **AC-15** (US-6 · A-13) IF the `risk_brief` provider has no API key, THEN the server SHALL return 422 with that provider's message and make no model call, the intent call included.
- **AC-16** (US-6 · S-2) IF intent derivation fails, THEN the server SHALL return the Intent Layer's error (502 `Intent derivation failed: …`, or 422 for a missing `review_intent` key), make no brief call and keep the stored brief.
- **AC-17** (US-5 · A-18) IF the brief call fails after its retries or passes NFR-1's deadline, THEN the server SHALL return 502 `Brief generation failed: <reason>` and keep the stored brief.
- **AC-18** (US-1 · A-2) WHILE a generation for a PR runs, WHEN another `POST /pulls/:id/brief` for that PR arrives, the server SHALL return 409 with the § Contract message and make no model call.
- **AC-19** (US-1 · A-2) WHILE a generation for a PR runs, `GET /pulls/:id/brief` SHALL return `generating: true`.
- **AC-20** (US-6 · S-8) IF the blast radius is degraded, THEN the server SHALL still store the brief, with `blast.degraded: true` and its `reason`, and the prompt SHALL name the blast as incomplete with that reason.
- **AC-21** (US-6 · S-2) IF the PR history is degraded, THEN the server SHALL still store the brief with `history.degraded: true` and its `reason`.
- **AC-22** (US-6 · A-19) IF the PR has no stored changed files, THEN `POST /pulls/:id/brief` SHALL return 422 `This pull request has no changed files to brief yet.` and make no model call.
- **AC-23** (US-4 · A-20) IF the stored JSON does not parse as `PrBrief`, THEN `GET /pulls/:id/brief` SHALL return `brief: null` and log one warn line `brief: unreadable` with the `prId`.
- **AC-52** (US-4 · S-13) WHEN `GET /pulls/:id` refreshes a PR from GitHub, the server SHALL store GitHub's head SHA as the PR's `head_sha` in the same update that writes its body, additions, deletions and files count.
- **AC-53** (US-4 · S-13) WHEN `GET /pulls/:id` has stored a new head SHA, `GET /pulls/:id/intent` SHALL return `stale: true` for an intent derived at the older SHA (a side effect of AC-52: Intent's `stale` reads the same column).
- **AC-24** (US-1 · S-3) WHILE `brief` is null and `generating` is false, the Overview tab SHALL show the PR Brief section with "No brief yet", "Generate a Why+Risk brief for this PR." and a "Generate brief" button.
- **AC-25** (US-1 · S-3) WHILE a generate request from the page is pending or GET returns `generating: true`, the Overview tab SHALL show the banner's spinner in place of the score, a `role="status"` "Generating brief…", skeletons in place of Risk areas and Review focus, and disable Generate and refresh.
- **AC-26** (US-1 · A-2) WHILE GET returns `generating: true`, the PR page SHALL refetch the brief every 5 s until it is false.
- **AC-27** (US-2 · S-2, A-33) WHILE a brief exists and the PR has a review with a verdict, the banner SHALL show that review's verdict, findings count, blockers, score and agent name with the brief's summary and the provenance tooltip (A-12, A-33).
- **AC-28** (US-2 · S-2) WHILE a brief exists and the PR has no review with a verdict, the banner SHALL show the brief's summary and the refresh button only — no verdict label or icon, no findings badge, no score.
- **AC-29** (US-2 · S-1) WHILE a brief exists, the Intent card SHALL show a "Risk areas" subsection with each risk's title, its severity as text and its first `file_refs` entry, a risk with no entry showing no file.
- **AC-30** (US-2 · S-3) WHEN the user activates a risk's "Why this is a risk" control, the Intent card SHALL show its explanation and every `file_refs` entry, and set `aria-expanded="true"` on the control.
- **AC-31** (US-2 · S-5) WHILE the brief has no risks, the Risk areas subsection SHALL show "No notable risks flagged.".
- **AC-32** (US-2 · S-3) WHILE the brief has at least one `review_focus` item, the Overview tab SHALL show "Review focus — read these first" with a count badge and one `file:line — reason` row per item, in stored order.
- **AC-33** (US-2 · P-4 · user) WHILE the brief has no `review_focus` item, the Overview tab SHALL show the Review focus panel with the text "No review focus items" and no count badge (A-26).
- **AC-34** (US-3 · S-1, A-34) WHEN the user activates a Review focus row, the PR page SHALL switch to Files changed with `file` and `line` in the query as a new history entry (A-34), expand that file and its role group, and scroll the file into view.
- **AC-35** (US-3 · S-3) WHEN Files changed opens with a target line that its diff renders, the tab SHALL scroll that line into view and highlight it.
- **AC-36** (US-3 · A-15) IF the target line is not rendered in the file's diff, THEN Files changed SHALL show the file as in AC-34 and highlight no line.
- **AC-37** (US-3 · S-3) WHEN the user activates a risk's file, the PR page SHALL open Files changed on that file as in AC-34, with no line.
- **AC-38** (US-3 · S-3) IF the target file is not among the PR's current changed files, THEN the PR page SHALL stay on Overview and show "File not in this PR's diff".
- **AC-39** (US-4 · S-2) WHILE GET returns `stale: true`, the PR Brief section SHALL show "Generated for {sha} — there are new commits" with the brief's 7-character SHA (A-17), keep the whole brief visible and send no POST by itself.
- **AC-40** (US-4 · S-1) WHEN the Overview tab loads and a brief is stored, the PR page SHALL show it and send no POST.
- **AC-41** (US-5 · P-1 · user) WHEN the user confirms the AC-55 dialog, the PR page SHALL send `POST /pulls/:id/brief` and, on 200, show the returned brief in place of the old one.
- **AC-42** (US-5 · A-18) IF a generate request fails, THEN the PR page SHALL show "Could not generate the brief: {message}" in a `role="alert"` element and keep showing the brief or empty state it showed before.
- **AC-43** (US-6 · S-10) IF the brief GET fails and no brief data is held, THEN the PR Brief section SHALL show "Could not load the brief." with a Retry button that refetches it.
- **AC-44** (US-6 · A-23) WHILE the stored brief has `blast.degraded` or `history.degraded` true, the PR Brief section SHALL show the matching `degraded.*` notice with its reason.
- **AC-55** (US-5 · P-1 · user) WHILE a brief is shown, WHEN the user activates the refresh button, the PR page SHALL open a dialog titled "Replace this brief?" with the text "Regenerating makes one model call on your API key and replaces the current brief." and the buttons "Regenerate" and "Cancel", and send no POST yet.
- **AC-56** (US-5 · P-1 · user) WHEN the user activates "Cancel" or presses Escape in that dialog, the PR page SHALL close it and send no POST.
- **AC-57** (US-1 · P-1 · user) WHEN the user activates "Generate brief" in the empty state, the PR page SHALL send `POST /pulls/:id/brief` with no confirmation dialog.
- **AC-58** (US-2 · P-5 · user) WHILE a brief is shown, the PR Brief section SHALL show "{model} · {cost}" under the summary, with the cost formatted as the Intent card formats it.
- **AC-59** (US-2 · P-5 · user) IF the brief's `generation.cost_usd` is null, THEN the PR Brief section SHALL show "{model} · —" and never "$0".
- **AC-60** (US-1 · P-2 · user) WHILE a generate request sent from this page is pending, the PR Brief section SHALL show "{seconds} s elapsed" next to the spinner, counted from the click and updated once per second.
- **AC-61** (US-1 · A-25) WHILE GET returns `generating: true` and no request from this page is pending, the PR Brief section SHALL show the AC-25 loading state without an elapsed counter.

### Must keep working
- **AC-45** (existing · `client/…/OverviewTab/_components/IntentCard/IntentCard.tsx:54-70`) WHEN the Overview tab renders, the Intent card SHALL CONTINUE TO show its empty, loading, error, stale and derive states as today, with or without a brief.
- **AC-46** (existing · `client/…/BlastCard/BlastCard.tsx:92`) WHEN the Overview tab renders, the Blast radius card SHALL CONTINUE TO show its counters, Tree/Graph and the collapsed "Prior PRs touching these files" accordion read from `GET /pulls/:id/history`.
- **AC-47** (existing · `client/…/ReviewRunAccordion/ReviewRunAccordion.tsx:138-147`) WHEN a review with a verdict is opened on the Agent runs tab, the banner SHALL CONTINUE TO show verdict, findings, blockers, score and agent name, with no regenerate button.
- **AC-48** (existing · `client/…/DiffTab/DiffTab.tsx`, `RoleGroup.tsx:23`) WHEN Files changed opens without a target, the tab SHALL CONTINUE TO show role groups, collapse defaults and the order toggle as today.
- **AC-49** (existing · `server/src/modules/intent/routes.ts`, `blast/routes.ts`) WHEN `GET`/`POST /pulls/:id/intent`, `GET /pulls/:id/blast` or `GET /pulls/:id/history` is called, the server SHALL CONTINUE TO answer with today's shapes and codes.
- **AC-50** (existing · `server/src/db/migrations/`, `server/src/db/schema/`) The change SHALL CONTINUE TO leave the migrations and the schema untouched, and the two `contracts/brief.ts` copies byte-identical.
- **AC-54** (existing · `server/src/modules/pulls/routes.ts:27,58-70`, `server/src/modules/polling/routes.ts:20`) WHEN the PR list syncs or a repo is polled, the server SHALL CONTINUE TO write `head_sha` and list the PRs as today; the offline fallback of `GET /pulls/:id` SHALL CONTINUE TO serve the stored detail without writing `head_sha`.

## States and edge cases
| Surface | Default | Loading | Empty | Error | Partial / degraded | No access | Stale / expired |
|---|---|---|---|---|---|---|---|
| PR Brief section + banner | AC-27, AC-28, AC-58, AC-59; refresh AC-55, AC-56 | AC-25, AC-26, AC-60, AC-61 | AC-24, AC-57 | AC-42, AC-43 | AC-44 | AC-4 (404), AC-51 (422) | AC-39 |
| Risk areas (Intent card) | AC-29, AC-30 | AC-25 | AC-31 | n/a (part of the brief) | AC-12 (no file) | AC-4 | AC-38 |
| Review focus panel | AC-32 | AC-25 | AC-33 (P-4) | n/a | AC-10, AC-11 | AC-4 | AC-38 |
| Files changed target | AC-34, AC-35 | n/a (tab's own) | AC-36 | AC-38 | AC-36 | n/a | AC-38 |
| `POST /pulls/:id/brief` | AC-5, AC-6 | AC-18, AC-19 | AC-22 | AC-14–AC-17 | AC-20, AC-21 | AC-4 | AC-7 |
| `GET /pulls/:id/brief` | AC-2 | AC-19 | AC-1 | AC-23 | n/a | AC-4 | AC-3, AC-52 |
| `GET /pulls/:id` (head SHA) | AC-52 | n/a | n/a | AC-54 (offline) | n/a | n/a | AC-53 |

Other edge cases: double click or a second tab → AC-18; reload mid-generation → AC-19, AC-26; a new commit between GET and POST → A-3; a PR body that tells the model to point at another file → AC-10, NFR-4; a closed or merged PR → generation allowed (A-14); a doc too large or missing → skipped, not a failure (S-9).

## Non-functional
- **NFR-1** (time budget · A-10, A-29) WHEN the brief call runs, the server SHALL abandon it after 120 s wall-clock and return 502 `Brief generation failed: timed out after 120 s`, leaving the stored brief unchanged.
- **NFR-2** (LLM calls · A-10) WHEN `POST /pulls/:id/brief` runs, the server SHALL make at most one brief call (`maxRetries` 1, so at most 2 attempts) with `maxTokens` 6,000 including hidden reasoning, plus at most one intent derivation only when no intent is stored; GET makes none.
- **NFR-3** (LLM input · A-5, A-6, A-27) WHEN the prompt is built, its untrusted facts SHALL total at most 45,000 chars as A-27 measures them, with no PR title or body among them: docs at most 3, 8,000 chars each, 16,000 total; changed files and caller files at most 100 paths and 4,000 chars of summed path length each list; history at most 10 items; the diff takes the remainder in role order core, tests, wiring, docs, with boilerplate left out.
- **NFR-4** (untrusted input · S-6, S-11) The server SHALL pass every fact as JSON inside one `<untrusted>` block with `</untrusted>` escaped, under a system prompt that says the block is data, never instructions.
- **NFR-5** (untrusted input · A-16) The PR page SHALL render every model-written string (summary, risk title and explanation, focus reason) as plain text: a summary holding `<img src=x>` or `[a](http://x)` shows those characters and creates no image or link element.
- **NFR-6** (untrusted input · S-6) WHILE a brief is generated, the server SHALL give the model no tools and send no request other than to the two feature-model providers and GitHub's history calls.
- **NFR-7** (privacy · S-8) WHEN a brief is generated, the server SHALL send the NFR-3 facts only to the `risk_brief` provider, make at most 20 commit-list and 10 PR-summary GitHub calls for history, and store the brief only in `pr_brief`.
- **NFR-8** (LLM cost · S-11) WHEN a brief is stored, `generation` SHALL hold the provider's `tokens_in`, `tokens_out`, `model` and `cost_usd` as reported (null stays null); the intent call's cost stays on the intent record and is not added.
- **NFR-9** (observability · S-6, A-32) WHEN a generation ends or a POST fails after the 409 guard, the server SHALL log one line — `brief: generated` (info) or `brief: failed` (warn) — with `prId`, `headSha`, `provider`, `model`, `tokensIn`, `tokensOut`, `costUsd`, `durationMs`, kept and dropped counts of focus items and file refs, `specsRead`, `blastDegraded`, `historyDegraded` or the failure `reason`, and no PR, diff or doc text.
- **NFR-10** (accessibility · S-3) The Review focus rows and risk file links SHALL be buttons reachable by Tab and activated by Enter or Space, named `focus.open` / `risk.open`; severity and staleness SHALL be stated in text, not colour alone; after a deep-link, focus SHALL move to the target file's header.
- **NFR-11** (wording · S-3) The user-visible strings SHALL be the `brief.json` values in § Contract and the server error texts there, verbatim.
- **NFR-12** (reliability · A-21) WHEN an 11th `POST /pulls/:id/brief` arrives within one minute from one client, the server SHALL return 429.

## Assumptions
- **A-1** POST waits for the model and returns the stored brief — because `POST /pulls/:id/intent` and the tour generate route do (S-6, S-7) and one call fits a pending button.
- **A-2** One generation per PR at a time: a parallel POST gets 409, GET reports `generating`, and the page polls every 5 s — the Onboarding Tour precedent (S-7).
- **A-3** "Head SHA" is the PR's stored `head_sha`, the one Intent's `stale` uses (S-6). The lag (S-11) is fixed here by AC-52 (user · 2026-10-09, S-13). It remains only while GitHub cannot be reached: then `GET /pulls/:id` serves the stored detail and `head_sha` keeps its last value.
- **A-4** "Active agents" are the workspace's agents with Enabled on — the set "Run all" reviews with (S-9); their docs resolve as a review run's do: own, then inherited through skills, read at the clone HEAD.
- **A-5** The doc budget is the Intent Layer's spec budget, 3 docs, 8,000 chars each, 16,000 total (S-6); docs past it are left out of the prompt and of `specs_read`; doc contents, not just paths, go in.
- **A-6** The total and list caps are the Intent Layer's: about 45,000 chars, 100 paths / 4,000 chars (S-6); history uses L04's 10-PR cap (S-8); boilerplate diffs are left out (S-12).
- **A-7** An item whose line is outside the diff is dropped, not clamped: a clamped line points at code the model did not mean. A file with no patch cannot be checked, so its items are dropped too.
- **A-8** `file_refs` hold bare changed-file paths; the model may write `path:12-18` (S-3 sample), so the suffix is removed before matching; a risk with no grounded file is kept, since some risks name no file.
- **A-9** Clamps after parsing, no schema `.max()` (S-6): summary ≤600 chars; ≤6 risks and ≤6 focus items (Intent's list cap); risk title and focus reason ≤160 chars; explanation ≤600 chars; ≤6 `file_refs` per risk. An empty summary is a failure, as an empty intent is (S-6).
- **A-10** Brief call bounds follow the tour: 120 s wall-clock, `maxTokens` 6,000, `maxRetries` 1 (S-7). The 6,000 leaves room for a reasoning model a user may pick in Settings (S-11).
- **A-11** A stored intent is used as it is, even when stale; the Intent card shows its own stale badge and Re-derive.
- **A-12** "The latest agent review" is the newest review on the PR that has a verdict; findings and blockers are counted as the Agent runs tab counts them for that review, and its agent name is shown, so a multi-agent batch is not silently merged (S-10).
- **A-13** The `risk_brief` key is checked before intent derivation, so a missing key never costs an intent call.
- **A-14** Layout: the PR Brief section sits above the existing Intent | Blast radius row, Review focus below it, Description last; with no brief only the empty state is added. A closed or merged PR can be briefed.
- **A-15** The deep-link target travels in the page query, where the tab already lives (S-10), so Back returns to Overview; a target line not rendered falls back to the file.
- **A-16** Model text is shown as plain text; the design's inline-code styling of risk explanations (S-3 `mdLite`) is not carried.
- **A-17** A short SHA is 7 characters, as the tour and run history show it (S-10).
- **A-18** A failed generate or regenerate keeps the stored brief and the page keeps what it showed — the tour's decision (S-7).
- **A-19** A PR with no stored changed files (never opened in the app, S-11) is refused with 422 rather than briefed on nothing.
- **A-20** A stored row that no longer parses is shown as "no brief"; Generate then overwrites it.
- **A-21** POST is limited to 10 calls a minute, as the intent POST is (S-6).
- **A-22** The model is asked for risk kinds `security`, `db_migration`, `breaking_api`, `perf`, `deps` (S-3); `kind` stays a free string and an unknown kind gets a generic icon.
- **A-23** The wording of the stale, degraded and error strings not shown in the design is the § Contract text.
- **A-24** The new `PrBrief` members are required: no reader, writer or test fixture of `PrBrief` exists (S-5).
- **A-25** A generation this page did not start has no known start time, so it shows no elapsed counter — the tour does the same (S-7).
- **A-26** "No review focus items" shows whenever `review_focus` is empty, whether the model returned none or grounding dropped them all: the stored brief does not record how many items were dropped.
- **A-27** "Untrusted facts ≤45,000 chars" is the length of the JSON text of the payload placed inside the `<untrusted>` block; a list's 4,000-char cap is the sum of its path lengths; the PR title and body are not sent, since NFR-3 and NFR-7 do not list them — source: plan R-5 · user · 2026-10-09 · confirmed.
- **A-28** Enabled agents are taken in order of `name`, then `id`; each agent's docs follow its run order (S-9); a path's first appearance is kept; the 3-doc cap applies in that order — source: plan R-6 · user · 2026-10-09 · confirmed.
- **A-29** The 120 s wall clock is a parameter of the brief model call, so a test can inject a short deadline — source: plan R-13 (REC-3) · user · 2026-10-09 · confirmed.
- **A-30** A hunk `@@ -a,b +c,d @@` covers new-side lines `c` to `c+d-1`; an omitted `d` is 1; `d=0` is an empty range; context lines inside a hunk count — source: plan R-7 · user · 2026-10-09 · confirmed.
- **A-31** Order of the answer's processing: ground, then remove duplicates (a repeated focus `file:line` is dropped), then cap at 6 — source: plan R-9 · user · 2026-10-09 · confirmed.
- **A-32** Every POST that fails after the 409 guard logs `brief: failed` — source: plan R-20 · user · 2026-10-09 · confirmed.
- **A-33** "Latest review" is the first review with a verdict in the PR's reviews list order (newest first); blockers are its CRITICAL findings that are not dismissed — source: plan R-26 · user · 2026-10-09 · confirmed.
- **A-34** The deep-link adds a history entry, so Back returns to Overview; a tab click clears `file` and `line`; the target applies when Files changed opens — source: plan R-29 · user · 2026-10-09 · confirmed.

## Open questions
none

## Proposals
- **P-1** Confirm before refresh replaces a brief — error prevention for a paid action; the tour accepted the same (S-7) — accepted (user · 2026-10-09) → AC-55, AC-56, AC-57, AC-41
- **P-2** Show "{seconds} s elapsed" next to the spinner while generating — visibility of system status — accepted (user · 2026-10-09) → AC-60, AC-61
- **P-3** An MCP tool `get_pr_brief {pr}` returning the stored brief as text — rejected (user · 2026-10-09); see § Non-goals
- **P-4** Show "No review focus items" instead of hiding the panel — tells the user the brief tried — accepted (user · 2026-10-09) → AC-33
- **P-5** Show the brief's model and cost under the summary, as the Intent card does — accepted (user · 2026-10-09) → AC-58, AC-59

## Traceability and verification
| ID | Story | Source | Method | Suite | Verification hint |
|---|---|---|---|---|---|
| AC-1 | US-4 | S-1 | test | server-integration | GET → 200 `{"brief":null,"generating":false,"stale":false}` |
| AC-2 | US-4 | S-1 | test | server-integration | stored row → 200 parses as `PrBriefResponse`; mock LLM, GitHub, index record 0 calls |
| AC-3 | US-4 | S-2 | test | server-integration | row with `head_sha` ≠ PR head → `stale: true`; equal → false |
| AC-4 | US-1 | S-6 | test | server-integration | unknown uuid and other workspace → 404 `Pull request not found` on GET and POST |
| AC-51 | US-1 | S-6 | test | server-integration | `id=abc` → 422 on GET and POST |
| AC-52 | US-4 | S-13 | test | server-integration | GitHub mock returns a new head SHA → after `GET /pulls/:id` the PR row's `head_sha` equals it |
| AC-53 | US-4 | S-13 | test | server-integration | intent at the old SHA → after `GET /pulls/:id`, `GET /pulls/:id/intent` has `stale: true` |
| AC-54 | US-4 | S-13 | test | server-integration | list sync and poll `.it` tests stay green; GitHub mock throwing → `head_sha` unchanged |
| AC-55 | US-5 | P-1 | test | client | refresh with a brief → dialog title, body, two buttons; POST mock not called |
| AC-56 | US-5 | P-1 | test | client | Cancel and Escape close the dialog; POST mock not called |
| AC-57 | US-1 | P-1 | test | client | Generate brief in the empty state → POST called once, no dialog |
| AC-58 | US-2 | P-5 | test | client | `model:"gpt-4.1", cost_usd:0.0123` → "gpt-4.1 · $0.01" under the summary |
| AC-59 | US-2 | P-5 | test | client | `cost_usd:null` → "gpt-4.1 · —"; no "$0" text |
| AC-60 | US-1 | P-2 | test | client | pending POST, timers advanced 3 s → "3 s elapsed" |
| AC-61 | US-1 | A-25 | test | client | `generating:true`, no pending POST → loading state, no "elapsed" text |
| AC-5 | US-1 | S-1 | test | server-integration | stubbed LLM records one call on the `risk_brief` model; 200 body has the brief, `stale:false` |
| AC-6 | US-1 | S-2 | test | server-integration | no intent row → intent row written first; brief `intent.intent` equals it |
| AC-7 | US-1 | S-1 | test | server-integration | two POSTs → one `pr_brief` row; `generation.head_sha` = PR head |
| AC-8 | US-1 | S-1 | test | server-unit | the built prompt holds intent, files with roles, diff, blast summary, callers, history, docs |
| AC-9 | US-1 | A-28 | test | server-integration | two enabled agents sharing a doc, one disabled agent → `specs_read` lists each enabled doc once, in name order, none of the disabled |
| AC-10 | US-3 | A-7 | test | server-unit | a focus item on a file outside the PR is absent from the stored brief |
| AC-11 | US-3 | A-30 | test | server-unit | a line outside every hunk, a `+c,0` hunk, and a file without patch → item absent; a context line inside a hunk and `+c` with `d` omitted → kept |
| AC-12 | US-3 | A-8 | test | server-unit | `src/a.ts:12-18` stored as `src/a.ts`; an unknown path removed; risk with no refs kept |
| AC-13 | US-2 | A-31 | test | server-unit | 8 risks / 8 focus items → 6 each in model order; duplicate `file:line` once and not counted toward the 6 |
| AC-14 | US-6 | A-9 | test | server-integration | blank summary → 502 with the message; earlier row unchanged |
| AC-15 | US-6 | A-13 | test | server-integration | no key → 422 `OPENAI_API_KEY is not configured`; LLM mock records 0 calls, no intent row |
| AC-16 | US-6 | S-2 | test | server-integration | throwing intent LLM → 502 `Intent derivation failed: …`; brief call count 0 |
| AC-17 | US-5 | A-18 | test | server-integration | throwing brief LLM → 502 `Brief generation failed: …`; earlier row byte-identical |
| AC-18 | US-1 | A-2 | test | server-integration | second POST during a gated first → 409 with the message, raced against a short timeout |
| AC-19 | US-1 | A-2 | test | server-integration | GET during a gated POST → `generating: true` |
| AC-20 | US-6 | S-8 | test | server-integration | index flag off → 200; stored `blast.degraded:true, reason:"flag_off"`; prompt names it |
| AC-21 | US-6 | S-2 | test | server-integration | GitHub mock throws → 200; stored `history.reason:"github_unavailable"` |
| AC-22 | US-6 | A-19 | test | server-integration | PR without `pr_files` → 422 with the message; 0 LLM calls |
| AC-23 | US-4 | A-20 | test | server-integration | row with `{"x":1}` → `brief:null`; warn line `brief: unreadable` |
| AC-24 | US-1 | S-3 | test | client | the three texts and the button render for `brief:null` |
| AC-25 | US-1 | S-3 | test | client | pending mutation → `role="status"` "Generating brief…", skeletons, buttons disabled |
| AC-26 | US-1 | A-2 | test | client | `generating:true` → the query refetches after 5 s, stops when false |
| AC-27 | US-2 | A-33 | test | client | newest review with a verdict → its verdict label, findings badge, undismissed CRITICAL blockers, score, agent name, brief summary |
| AC-28 | US-2 | S-2 | test | client | no review → summary and refresh only; no verdict text, badge or score |
| AC-29 | US-2 | S-1 | test | client | each risk's title, severity text and first file render; risk with `[]` shows no file |
| AC-30 | US-2 | S-3 | test | client | activating the control shows the explanation; `aria-expanded="true"` |
| AC-31 | US-2 | S-5 | test | client | `risks:[]` → "No notable risks flagged." |
| AC-32 | US-2 | S-3 | test | client | heading, count badge, rows `file:line — reason` in stored order |
| AC-33 | US-2 | P-4 | test | client | `review_focus:[]` → heading and "No review focus items"; no count badge |
| AC-34 | US-3 | A-34 | test | client | click → a pushed history entry `?tab=diff&file=…&line=…`; the target file and its collapsed group are expanded; a tab click clears `file` and `line` |
| AC-35 | US-3 | S-3 | demo | — | the line scrolls into view and pulses in the running app |
| AC-36 | US-3 | A-15 | test | client | target line absent from the patch → file expanded, no highlighted line |
| AC-37 | US-3 | S-3 | test | client | risk file click → query has `file`, no `line` |
| AC-38 | US-3 | S-3 | test | client | file not in `files` → tab unchanged, "File not in this PR's diff" shown |
| AC-39 | US-4 | S-2 | test | client | `stale:true` → marker text with the 7-char SHA; brief visible; no POST sent |
| AC-40 | US-4 | S-1 | test | client | stored brief on load → brief renders, the POST mock is never called |
| AC-41 | US-5 | P-1 | test | client | refresh → confirm → one POST; the returned summary replaces the old one |
| AC-42 | US-5 | A-18 | test | client | POST 502 → `role="alert"` text with the message; previous brief still rendered |
| AC-43 | US-6 | S-10 | test | client | GET error with no data → "Could not load the brief." and Retry refetches; error with stale data keeps the brief |
| AC-44 | US-6 | A-23 | test | client | `blast.degraded:true` → the blast notice with its reason |
| AC-45 | US-2 | S-10 | test | client | IntentCard's existing tests stay green; with a brief its empty state still offers Derive |
| AC-46 | US-2 | S-8 | test | client | BlastCard and HistoryAccordion tests stay green |
| AC-47 | US-2 | S-10 | test | client | ReviewRunAccordion banner shows verdict and score; no refresh button |
| AC-48 | US-3 | S-10 | test | client | DiffTab without query target: groups and collapse defaults as before |
| AC-49 | US-1 | S-6 | test | server-integration | existing intent, blast and history `.it` tests stay green |
| AC-50 | US-1 | S-1 | inspection | — | `git diff --stat` empty for migrations and `schema*`; `diff` of the two `brief.ts` empty |
| NFR-1 | US-6 | A-29 | test | server-unit | callBriefModel with an injected short deadline → rejects with "timed out" |
| NFR-2 | US-1 | A-10 | test | server-unit | the stubbed LLM sees `maxTokens` 6,000, `maxRetries` 1, one brief call per POST |
| NFR-3 | US-1 | A-27 | test | server-unit | oversized facts → JSON payload length ≤45,000; 4 docs → 3 in `specs_read`; a lockfile's patch absent; no title or body in the payload |
| NFR-4 | US-1 | S-11 | test | server-unit | a body containing `</untrusted>` appears escaped; one `<untrusted` block |
| NFR-5 | US-2 | A-16 | test | client | summary `<img src=x>` → literal text, no `img` or `a` element |
| NFR-6 | US-1 | S-6 | inspection | — | the brief request passes no tools; mocks record no other outbound call |
| NFR-7 | US-1 | S-8 | test | server-integration | GitHub mock call counts ≤20 commit lists and ≤10 PR summaries |
| NFR-8 | US-1 | S-11 | test | server-integration | stub returns `costUsd: null` → stored `cost_usd: null`; tokens and model copied |
| NFR-9 | US-6 | A-32 | test | server-integration | one `brief: generated` line with the fields and no body text; `brief: failed` on every 422 and 502 after the guard |
| NFR-10 | US-3 | S-3 | test | client | rows are buttons named "Open src/a.ts:12 in Files changed"; severity text present; focus on target header |
| NFR-11 | US-1 | S-3 | inspection | — | `brief.json` values and server messages equal § Contract |
| NFR-12 | US-1 | A-21 | test | server-integration | app built with rate limiting on: 11th POST in a minute → 429 |

## Self-check
- [x] Every AC and NFR is one EARS sentence with one trigger and an observable response — no "fast", "properly", "gracefully".
- [x] Every number is sourced (`S-n`) or an assumption (`A-n`).
- [x] Every user story has an AC and an Independent test; every `S-n` is cited at least once.
- [x] Every state-matrix cell holds an AC, an `A-n`, a marker or `n/a`.
- [x] Every AC and NFR has a row in § Traceability and verification.
- [x] No HOW: no file to change, library, layer or work order outside § Sources and § Must keep working.
- [x] A changed shared contract names both vendored copies; a stored field names the migration gate.
- [x] At most 3 `[NEEDS CLARIFICATION]` markers, each repeated under § Open questions.
