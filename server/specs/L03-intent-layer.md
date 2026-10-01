# Intent Layer — what a PR is meant to do

**Status:** in-progress
**Lesson / ticket:** L03

One spec for the whole feature. The client-only and reviewer-core-only parts are
in [../../client/specs/L03-intent-layer.md](../../client/specs/L03-intent-layer.md)
and [../../reviewer-core/specs/L03-intent-layer.md](../../reviewer-core/specs/L03-intent-layer.md).

## Goal
Each review agent knows what the PR is meant to change and what it deliberately
leaves out. The intent is derived from the title, description, linked ticket and
linked spec or plan; when those are missing it falls back to commits, branch and
diff. One cheap structured LLM call produces: a statement, an in-scope list, an
out-of-scope list. **Confidence is computed in code** and drops when only indirect
signals exist. The call runs automatically once per review batch (cached by a hash
of its inputs) and can be triggered from the **Intent** card on the PR Overview
tab. The intent reaches every agent's prompt as an untrusted `## Stated intent`
slot. If it cannot be derived, the review runs without the slot and never fails
because of it.

## Non-goals
- Fetching any URL over HTTP (Notion, Jira, Linear, Google Docs, arbitrary links).
  They are recorded as `unresolved`, never fetched. **Security invariant (A4).**
- Extracting tracker keys (`[A-Z][A-Z0-9]+-\d+`): needs an allowlist, false positives ("UTF-8").
- GraphQL `closingIssuesReferences` (sidebar-linked issues). v1 is regex + REST only.
- Cross-repo issues/specs (`owner/other#N`) → `unresolved: cross_repo`.
- Deriving intent on PR import, list sync or any GET.
- Intent history: one row per PR, overwritten.
- Passing intent in the CI agent-runner (reviewer-core accepts it; nothing in CI passes it).
- Adding intent cost to `agent_runs.cost_usd` or the PR-list cost.
- Clickable source refs in the UI (plain text).
- Smart Diff (the other half of L03).

## Contract

### Review-scope invariants (A3)
Intent is context for the model, never a filter. No code path filters, drops or
downgrades findings by intent or scope: `groundFindings` and
`countBlockers(findings, agent.ciFailOn)` never receive it.
1. Scope never filters or lowers findings.
2. A CRITICAL finding outside the stated scope is still CRITICAL and a blocker.
3. An author's "out of scope" never excuses reviewing that code.
4. A scope mismatch on its own is at most WARNING.
5. "Does not do what it promised" findings only at medium/high confidence.

### Data sources
All sources are untrusted. Totals are capped at about 45k chars.

| Source | Read from | Budget |
|---|---|---|
| title | `pull_requests.title` | 300 chars |
| description | `pull_requests.body` (HTML comments removed). Only filled once `GET /pulls/:id` opened the PR | 6,000 chars |
| ticket | refs in title/body: (1) closing keyword, (2) same-repo issue URL, (3) bare `#N` only if (1),(2) found nothing; `GitHubClient.getIssue`; a PR is rejected | ≤2 issues; title 300 + body 4,000 each |
| spec / plan | repo-relative doc paths and same-repo GitHub blob URLs (URL ref ignored) in the body and ticket bodies, read at `pull.headSha` via `GitClient.readFileAtRef`; on a miss one `fetchPullHead`, then retry | ≤3 files; raw ≤200 KB; 8,000 chars each, 16,000 total |
| other links | any other URL, cross-repo GitHub links | never fetched; ≤10 `unresolved` entries |
| commits | `pr_commits.message` | ≤20 × 200 chars, 3,000 total |
| branch | `pull_requests.branch` | 200 chars |
| files | review: `UnifiedDiff.files`; manual: `pr_files` | ≤100 paths, 4,000 chars |
| diff | review: `diff.raw`; manual: `pr_files.patch` joined | first 8,000 chars |

Path canonicalisation runs before any read: strip `#…`/`?…`, percent-decode,
drop leading `./` and `/`, `posix.normalize`; reject `..`-prefixed, NUL, `.git/`
segment, leading `-`, or an extension outside `.md .mdx .markdown .txt .rst .adoc`.
The adapter rejects a `ref` that is not `/^[0-9a-f]{7,40}$/`.

### Call sequence
1. **Review run.** `ReviewRunExecutor.executeRuns` loads the diff, then calls
   `container.intent.resolveForReview(...)` once per batch. It gathers sources,
   computes `input_hash = sha256(JSON{promptVersion, provider, model, headSha,
   title, body, branch, commits, tickets, specs})` (diff and file list are left
   out: `headSha` pins them), reuses the stored row on a match (log "Intent:
   cached"), else makes one structured call and upserts. Every agent gets the same
   `ReviewIntent`.
2. **Manual.** `POST /pulls/:id/intent` always calls the model.
3. **Read.** `GET /pulls/:id/intent` never calls the model. `stale = row.head_sha !== pull.headSha`.
4. **Failure.** `resolveForReview` never throws. Any error or timeout returns
   `undefined`, writes "Intent unavailable — <reason>; reviewing without it" to the
   live log and a pino warn; agents run with the slot omitted. Budget
   `INTENT_REVIEW_BUDGET_MS = 45_000`. A failed derivation does not reuse an older row.
5. **Model bounds.** `temperature 0`, `maxTokens 800`, `timeoutMs 20_000`, `maxRetries 1`.

### Confidence (deterministic, `modules/intent/helpers.ts`)
- `ticket` = an issue resolved (not a PR); `spec` = a non-empty spec read;
  `substantiveBody` = ≥60 chars of prose after removing HTML comments, heading-only
  lines and unchecked checkbox lines.
- **high** = ticket && spec; **medium** = ticket || spec || substantiveBody; else **low**.
- The model can only lower it: `sources_conflict` lowers one step; **(A2)** a spec
  was used (`flags.spec`) but the classifier's `evidence` cites no `spec` source →
  one more step down and a pino warn `'intent: spec ignored by classifier'` with
  `{prId, specs: n}`. Never below `low`. No model number is read or stored.

### Classifier
`schemaName: 'PrIntentClassification'`, fields in generation order: `evidence`,
`intent`, `in_scope`, `out_of_scope`, `sources_conflict`. No `.max()` in the schema
(a violated one triggers a paid reprompt); `clampClassification` truncates after
parsing: intent ≤300 chars, ≤6 items per list, ≤160 chars per item, trimmed,
de-duplicated. An empty intent is a failure. The user message is the sources as
JSON inside one `<untrusted>` wrapper.

### Review prompt slot (reviewer-core)
See the reviewer-core spec. Position: after `## PR description`, before
`## Skills / rules`. The trusted caution line depends on confidence (**A1**):
high/medium add "Changes outside the stated scope may be reported as a separate
scope finding of at most WARNING severity; a real defect anywhere in the diff
keeps its true severity, including CRITICAL, regardless of scope."; low says the
intent is a weak hint and findings must not be raised solely because the diff
differs from it.

### Routes (`modules/intent`)
- `GET /pulls/:id/intent` → 200 `PrIntentResponse`; 404 unknown / other-workspace PR.
- `POST /pulls/:id/intent` (rate limit 10/min) → 200 non-null; 404; 422 when the
  feature model's provider key is missing; 502 when the model fails or returns an empty intent.

### Zod / DB
- `contracts/review-api.ts` (both vendored copies): `IntentConfidence`,
  `IntentSourceKind`, `IntentUnresolvedReason`, `IntentSource`, extended
  `PrIntentRecord`, `PrIntentResponse`. `PromptAssembly.intent`. `IssueMeta` gains
  `labels`, `state_reason`, `is_pull_request`. `GitClient.readFileAtRef`.
- Default model for `review_intent` becomes `openrouter` / `deepseek/deepseek-v4-flash`.
- Migration `0013_extend_pr_intent` adds 10 columns to `pr_intent` (`confidence`,
  `sources`, `head_sha`, `input_hash`, `provider`, `model`, `tokens_in`,
  `tokens_out`, `cost_usd` nullable = unknown, `derived_at`). The table had no
  writer before, so it is empty; the NOT NULL defaults exist only for ALTER safety.

## Decisions taken
- Extend the existing `pr_intent` (one row per PR); persist through `ReviewRepository`.
- Derive once per review batch plus a manual POST, cached by `input_hash`.
- Confidence in code; the model can only lower it.
- Specs read from the object database at the head SHA (`git show`), not the working tree.
- Never fetch external URLs (removes SSRF by construction).
- Ticket via regex + REST `getIssue` (no GraphQL).
- Intent cost stored on `pr_intent`, not on `agent_runs` (shared by N agents, reused from cache).
- On failure the slot is omitted; lengths clamped in code.

## Risks
- Second-order injection: the intent is the model's paraphrase of author text.
  Mitigated by JSON-encoded untrusted input, no tools, clamping, re-wrapping as
  untrusted with a trusted caution line, and `INJECTION_GUARD`. A crafted body can
  still bias `in_scope`; confidence and sources are shown.
- **A review started before the PR detail was ever opened sees `body = NULL`**
  (body and commits are filled only by `GET /pulls/:id`) → low confidence. Accepted
  v1 limitation; the intent service does not fetch the PR from GitHub.
- `stale` can lag: `head_sha` is updated only by list sync and poll.
- Map-reduce repeats the slot in every chunk (≤2,000 chars × files).
- A manual POST during a review makes two paid calls; the last upsert wins.
- Assumption: `git show <sha>:<path>` does not follow symlinked directories.
- Verified 2026-10-01: deepseek-v4-flash (OpenRouter) honours strict `json_schema` for
  `PrIntentClassification` — one live `POST /pulls/:id/intent` on the seeded PR #482:
  HTTP 200 in 13.3 s, 570/402 tokens, $0.000132 (OpenRouter's billed `usage.cost`).

## Acceptance criteria
- [ ] AC-1 `GET` with no intent → `{"intent":null}`; unknown/other-workspace → 404.
- [ ] AC-2 `POST` with a mocked LLM → 200 with the clamped fixture, `stale:false`, a 64-hex `input_hash`.
- [ ] AC-3 Confidence: ticket+spec → high; ≥60-char body only → medium; nothing → low; conflict lowers one step.
- [ ] AC-4 External URLs recorded `unresolved: external_not_fetched`, never read or fetched.
- [ ] AC-5 `../../etc/passwd.md` → `unresolved: outside_repo`; `readFileAtRef` never sees `..`.
- [ ] AC-6 Two agents → exactly one `PrIntentClassification` call; both traces carry the same intent, after `## PR description` and before `## Diff to review`.
- [ ] AC-7 Unchanged re-run → no model call, log "Intent: cached".
- [ ] AC-8 A throwing intent LLM → runs end `done`, no intent slot, log "Intent unavailable".
- [ ] AC-9 reviewer-core: no intent → byte-identical prompt; `</untrusted>` escaped.
- [ ] AC-10/11 UI states and trace block (see the client spec).
- [ ] AC-12 `review_intent` default is `openrouter` / `deepseek/deepseek-v4-flash` in all three registries.
- [ ] AC-13 Server and client copies of `contracts/review-api.ts` and `platform.ts` are identical.
- [ ] AC-14 (A2) A used spec that the classifier never cites lowers confidence one step and logs the warn.
- [ ] AC-15 (A3) No finding is dropped or downgraded by intent; a CRITICAL outside scope stays a blocker.

## Test plan
Not written in this iteration (deliberate: the user deferred tests). When added:
reviewer-core `test/prompt.test.ts` (slot, omit rule, escaping, cap, both caution
lines); server unit tests for `helpers.ts` and `sources.ts`; a temp-git-repo test
for `readFileAtRef`; `server/test/intent.it.test.ts` (Docker, isolated from real
keys: `scripts/checks.sh`, or for one file the recipe in `.claude/agents/README.md`
§ Running the integration suite without real keys) for the routes and review wiring; client `IntentCard.test.tsx` and
a `RunTraceDrawer` case. Existing review `.it` tests must stub `overrides.intent`.
