# Conventions — repo house-rules → candidates → skill

**Status:** done
**Lesson / ticket:** L02
**Related:** [L02-skills.md](L02-skills.md) — the extractor's output is an ordinary skill.

## Goal

A reviewing agent knows generic good practice but nothing about *this*
codebase's house rules: the `osf`-prefixed selectors, the import-group order,
the `AsyncStateModel<T>` state shape. Today a maintainer has to notice such a
rule and hand-write a skill for it.

**Conventions** scans a cloned repo for the rules it *already follows*, shows
each one with the code that proves it, lets a maintainer accept / reject / edit
them, and merges the selected set into one skill.

The design premise: **a model is good at noticing a pattern and bad at
remembering where it saw it.** So the model only ever *proposes* — code chooses
what it reads, and code verifies what it claims.

```
repo-intel + config wish-list      ONE cheap structured call        re-read the file
        │                                    │                              │
   ┌────▼─────┐   line-numbered  ┌───────────▼──────────┐   candidates ┌────▼──────┐   pending rows
   │  SAMPLE  ├─────listing─────►│       PROPOSE        ├─────────────►│  VERIFY   ├──────────────►
   │  (code)  │                  │       (model)        │              │  (code)   │
   └──────────┘                  └──────────────────────┘              └───────────┘
```

Serves: anyone maintaining reviewer agents in the studio (Skills Lab →
Conventions).

## Non-goals

- **Linking the new skill to an agent from the create-skill modal.** The only
  agent-skill write that exists is `PUT /agents/:id/skills`, which *replaces*
  the whole ordered set and would wipe an agent's other links. The user attaches
  the skill from the Agent Editor's Skills tab, which already does this safely.
- **Git history as evidence.** Mining review comments and repeated fix-up
  commits is the strongest possible signal and is deliberately deferred.
- **Frequency as the confidence signal.** Counting a rule's occurrences across
  the whole repo (via the `CodeIndex` adapter) would beat the model's
  self-reported confidence; out of scope here.
- **Two-step file selection.** `MockLLMOptions.structuredBySchema` anticipates a
  `ConventionFileSelection` call before `ConventionExtraction`; this spec ships
  the one-call form only.
- **Scheduled / on-merge scans.** A scan is a user action.

## Decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Sampling is **100 % code**, never a model call | deterministic cost; the model cannot browse or choose files |
| D2 | The evidence gate is **code, not a second model** | a candidate whose snippet is not in the cited file is *dropped*, not "low-confidence" |
| D3 | The displayed snippet is **re-read from the file**, not the model's text | the UI cannot show a paraphrase as if it were code |
| D4 | A wrong line number is **corrected**, not fatal | miscounting is a formatting slip; inventing code is not |
| D5 | Triage is a three-state `status`, not a boolean | a re-scan replaces only `pending`, so a rejected rule never comes back |
| D6 | The skill is a **draft** (`POST …/conventions/skill`), persisted only via `POST /skills` | same preview-then-confirm flow as skill import |
| D7 | The scan reports `proposed` / `dropped_ungrounded` / `dropped_duplicate` | 3 candidates out of 12 reads as "the gate worked", not "the feature is broken" |
| D8 | The model comes from `FEATURE_MODELS.conventions` | picking a cheap model is a user setting, not a constant |
| D9 | Extraction is **synchronous** (no `JobRunner`) | `JobRunner`'s default timeout is 120 s and it surfaces no progress; the client shows a pending button instead |

## What already existed (do not rebuild)

| Layer | Already there | File |
|-------|---------------|------|
| DB | `conventions` table (rule / evidence / confidence) | `src/db/schema/knowledge.ts:31` |
| Contracts | `ConventionCandidate` | `src/vendor/shared/contracts/knowledge.ts:179` |
| Sampling | `repoIntel.getConventionSamples(repoId, n)` | `src/modules/repo-intel/service.ts:630` |
| Model config | `FEATURE_MODELS.conventions` + `resolveFeatureModel` | `contracts/platform.ts:74`, `modules/settings/feature-models.ts:51` |
| i18n | most of the `conventions` namespace | `client/messages/en/conventions.json` |
| Routing | `activeKeyFor()` maps `/conventions` | `client/src/components/app-shell/helpers.ts:31` |
| Test seam | `MockLLMOptions.structuredBySchema` | `src/adapters/mocks.ts:46` |

## Data model

Migration `0012_add_convention_triage.sql`, hand-written (`db:generate` is
forbidden by AGENTS.md; the recipe is in the root `INSIGHTS.md`):

| Column | Why |
|--------|-----|
| `category` | grouping chip + skill section; the 8 contract values, defaulting to `general` |
| `rationale` | one sentence on what a reviewer should flag; editable, nullable |
| `evidence_line` | 1-based, **as verified by code**, not as claimed by the model |
| `status` | `pending` / `accepted` / `rejected`; replaces the `accepted` boolean |
| `created_at` | ordering; part of `conventions_repo_created_idx` |

`accepted` is backfilled into `status` and dropped — nothing writes it today.
Both enums are `text({ enum })`, which narrows TypeScript only; no CHECK
constraint is added, matching the neighbouring `memory.scope` / `memory.kind`
columns. The contract, the route schema and the column default are what keep an
unknown value out. `evidence_line` is `NOT NULL DEFAULT 1` purely so the ALTER
is safe on a non-empty table; every row the service writes carries the line the
gate resolved.

## Contract

Canonical copy in `src/vendor/shared/contracts/knowledge.ts`, hand-ported to
`client/src/vendor/shared/`:

- `ConventionCategory` — `naming` · `structure` · `errors` · `testing` ·
  `imports` · `typing` · `api` · `general`
- `ConventionStatus` — `pending` · `accepted` · `rejected`
- `ConventionCandidate` — extended with `category`, `rationale`,
  `evidence_line`, `status`, `created_at` (replacing `accepted`)
- `ConventionExtractResult` — candidates + `proposed` / `dropped_ungrounded` /
  `dropped_duplicate` + `model` + `cost_usd`
- `ConventionSkillDraft` — the un-persisted skill (`name`, `description`,
  `type`, `body`, `evidence_files`, `convention_ids`)

### Routes — `src/modules/conventions/`

```
GET    /repos/:id/conventions          → candidates for the repo
POST   /repos/:id/conventions/extract  → scan (one model call)
POST   /repos/:id/conventions/skill    → skill DRAFT from the selected ids (writes nothing)
PATCH  /conventions/:id                → accept / reject / edit rule + rationale
DELETE /conventions/:id                → drop a candidate
```

### Stage 1 — sampling (no model)

`CONFIG_SAMPLE_PATHS` (package.json, tsconfig, eslint/prettier/editorconfig,
biome, CONTRIBUTING/AGENTS.md) — missing ones skipped silently — followed by
`repoIntel.getConventionSamples(repoId, 12)`. Each file truncated to 220 lines /
12 000 chars, the whole sample to 90 000 chars, every file rendered with a
**1-based line-number gutter**; that gutter is what makes a citation checkable.
A repo with nothing readable 422s **before** any model call.

### Stage 2 — proposal (the only model call)

One `completeStructured` at `temperature 0.1`, `schemaName:
'ConventionExtraction'`. The prompt states what counts as a house rule, lists
the anti-patterns not to return (universal advice, framework requirements,
single-trivial-line evidence), defines each category, fixes the confidence
bands, caps the answer at 12, and says outright that an ungrounded candidate
will be discarded.

**Schema field order is load-bearing.** `category` and `confidence` come *after*
`rule`, the evidence and a self-reported `occurrences` count. A model commits to
a label before it knows what it is about to say, so anything it must *judge*
belongs after everything it must *observe*.

### Stage 3 — the evidence gate (no model)

`verifyCandidate()` — three mechanical checks:

1. **Path was sampled.** Exact match, or a *unique* suffix match. Ambiguity is
   not resolved — guessing would defeat the gate.
2. **Snippet is substantial** (≥ 8 non-space chars) — `}` identifies nothing.
3. **Snippet is in the file.** Whitespace/case-insensitive; the hit nearest the
   claimed line wins. No hit → dropped.

The kept snippet is sliced from the file and dedented. Candidates are then
sorted by confidence and deduped against each other *and* against every rule the
user has already accepted or rejected.

## Acceptance criteria

- [ ] `POST /repos/:id/conventions/extract` returns candidates whose every
      snippet occurs verbatim in the cited file at the returned line.
- [ ] A candidate citing a file that was not sampled, or a snippet not present
      in it, is dropped and counted in `dropped_ungrounded`.
- [ ] A re-scan replaces only `pending` rows; accepted and rejected rules keep
      their status and are not proposed again.
- [ ] `PATCH /conventions/:id` accepts / rejects / edits rule and rationale.
- [ ] `POST /repos/:id/conventions/skill` returns a draft assembled from the
      requested ids and persists nothing; `POST /skills` then stores it with
      `source: 'extracted'` and the evidence files.
- [ ] An unindexed or unclonable repo 422s before any model call.
- [ ] The scan honours the workspace's `FEATURE_MODELS.conventions` override.
- [ ] Every route is workspace-scoped; a foreign convention id 404s.

## Test plan

| Lane | File | Covers |
|------|------|--------|
| server unit | `test/conventions-helpers.test.ts` | gutter rendering, budget cut-off, every gate outcome, line correction, ambiguous path, dedupe, skill body |
| server integration | `test/conventions.it.test.ts` | scan drops the invented candidate, re-scan preserves decisions, edit → draft → `POST /skills`, 422 on unsampleable repo and on empty selection, cross-workspace 404 |
| live | one scan, cheap model | recorded below: candidate count, gate drops, cost |

Integration tests inject `MockLLMProvider` via `overrides.llm` with
`structuredBySchema: { ConventionExtraction: … }`.

## Live run

Verified once against a real Angular repo (17 files sampled: 5 config +
12 ranked by repo-intel), `deepseek/deepseek-v4-flash` via OpenRouter:

| | |
|---|---|
| Proposed | 12 |
| Dropped by the evidence gate | 1 |
| Kept | 11 |
| Cost | $0.0029 |
| Wall clock | ~2 min 30 s (one silent retry, see below) |
| Categories used | 4 of 8 (`imports` 5, `general` 4, `structure`, `naming`) |
| Confidence spread | 0.70 – 0.95 |

The spread confirms the field-order decision: with `category` and `confidence`
generated after the rule and its evidence, the model discriminates instead of
labelling everything alike.

Real house rules it found, none of which a generic reviewer would know: the
`@defs` / `@core` / `@env` / `@utils` path aliases, feature types living in a
co-located `defs.ts`, and `inject()` over constructor injection.

**What the run changed.** The adapter applies `timeoutMs` PER ATTEMPT and
retries twice by default, so the original 120 s bound cut the first attempt
short and the scan only succeeded on the retry — at double the latency and an
extra call's cost, with nothing surfaced. `EXTRACT_TIMEOUT_MS` is now 240 s and
`EXTRACT_MAX_RETRIES` is 1, which bounds the worst case instead of hiding it.

The scan reads the CLONE on disk, so a citation is only guaranteed to line up
with GitHub while the clone is in sync with the default branch.
