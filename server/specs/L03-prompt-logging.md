# Safe structured logging of prompt assembly

**Status:** done
**Lesson / ticket:** L03 lab-2

## Goal
Operators can see, per prompt, which sections went in, where each came from, how big each was (chars and estimated tokens), which provider/model was asked, and which batch or request it belongs to. Secrets, diffs, spec text, issue bodies and PR bodies never appear in the logs, in either mode.

## Non-goals
- No UI or client change; `run_traces` content and the vendored `PromptAssembly` contract are unchanged.
- No tokenizer: tokens are `ceil(chars / 4)`.
- Non-prompt LLM calls (conventions, skills import, embeddings) are not logged here.
- No change to SSE or the Live Log text; masking affects only the pino stdout mirror (and the grounding-drop mirror text, see AM2).
- No log shipping, rotation or persistence.

## Contract
No HTTP or Zod contract change. Additive reviewer-core exports: `SectionTrust`, `PromptSectionMeta`, `estimateTokens`, `describeSection`, `AssembledPrompt.sections`, `ReviewInput.onPrompt`, `ReviewEvent.mirrorMsg`. reviewer-core logs nothing; it hands metadata to the caller.

**Review sections** (name → source, trust): `system`→`agent.system_prompt` T · `injection_guard`→`reviewer-core.guard` T · `task`→`server.task_line` U · `pr_description`→`pr.body` U · `intent`→`intent.derived` U · `skills`→`agent.skills` T (items) · `memory`→`memory` T (items) · `repo_map`→`repo-intel.map` U · `specs`→`specs` U (items) · `callers`→`repo-intel.callers` U · `diff`→`pr.diff` U. Absent sections are not listed.

**Intent sections:** `system`→`intent.system_prompt` T · `title`→`pr.title` U · `description`→`pr.body` U · `ticket`→`tracker` U ref `#n` · `spec`→`repo.spec` U ref `<path>` · `commits`→`git.commits` U (items) · `branch`→`pr.branch` U · `files`→`pr.files` U (items) · `diff`→`pr.diff_excerpt` U · `instruction`→`intent.instruction` T.

**Config:** `DEVDIGEST_PROMPT_LOG` is `default` or `verbose` (empty means unset). `AppConfig.promptLogRequested` is the requested value, `AppConfig.promptLog` the effective one. Verbose is honoured only when the raw env `NODE_ENV` is explicitly set (non-empty) to `development` or `test`; the schema default does not count. Otherwise one boot warn line names the reason (`NODE_ENV not set explicitly` or `NODE_ENV=<value>`). Verbose raises the default `LOG_LEVEL` to `debug`; an explicit `LOG_LEVEL` wins.

**Log lines:**
- `prompt: assembled` (info), once per agent run and once per intent derivation (not on a cache hit). Carries `correlationId`, `kind`, `provider`, `model`, `totalChars`, `totalTokensEst`, `sections[]` of `{name, source, ref?, trust, chars, tokensEst, items?}`; review lines add `prId`, `runId`, `agent`, `strategy`, `chunks`. Never `sha256`, `preview`, `order` or `chunk`.
- `prompt: detail` (debug, verbose only), one per chunk: `order`, `chunk {index, of, label}`, sections with `sha256`, and a masked 120-char `preview` on the `system` section only.
- `correlationId`: a new UUID per `executeRuns` batch; `req.id` for a manual intent POST. `intent: derived` and `intent: cache hit` gain `inputHash` (12 hex).
- Grounding drops (AM2): the pino mirror logs only the count and a generic reason; the bus/Live Log keeps the finding title.

**Never logged:** secrets/API keys, diff body, spec/plan contents, issue bodies, PR body text, model-generated finding text. Content is kept out by never building it into the payload; pino `redact` (`*.diff`, `*.body`, `*.content`, `*.text`, `*.systemPrompt`, ...) and `maskSecrets` on the RunLogger mirror are a backup layer. Runtime secret patterns live in `server/src/platform/secret-mask.ts`; a unit test compares them with the security-reviewer Step 2 table.

## Acceptance criteria
- [ ] AC-1 A review of a diff with `AKIAIOSFODNN7EXAMPLE` and a PR body linking a spec with a sentinel yields captured logs containing neither, in default and verbose mode.
- [ ] AC-2 Default mode: exactly one `prompt: assembled` per agent run and per intent derivation (none on cache hit), with `correlationId`, `provider`, `model`, `kind`, and sections carrying `name, source, trust, chars, tokensEst`, no `sha256`/`preview`.
- [ ] AC-3 In one batch the intent lines and every agent's `prompt: assembled` share a `correlationId`.
- [ ] AC-4 A manual `POST /pulls/:id/intent` logs `prompt: assembled` with `correlationId` equal to the request id.
- [ ] AC-5 Verbose + `NODE_ENV=development` → `promptLog==='verbose'`, default level `debug`. Verbose + `production` → `default` plus a warn line. Verbose with NODE_ENV unset → `default` plus the warn line.
- [ ] AC-6 Map-reduce over 3 files, verbose: 1 info line and 3 `prompt: detail` lines; default: 1 info, 0 debug.
- [ ] AC-7 `preview` only on `system`, at most 120 chars plus mask suffix, secret shapes masked (masked before the cut). It ends in `…` whenever the flattened prompt is longer than 120 chars, even when masking shortened it below that.
- [ ] AC-8 `assemblePrompt(...).messages` and the intent user prompt are byte-identical to before.
- [ ] AC-9 Changing a row of the security-reviewer Step 2 table without updating `secret-mask.ts` fails a unit test.
- [ ] AC-10 A grounding-dropped finding whose title contains `SPEC-SENTINEL-42` shows the title on the bus/trace while captured pino output does not contain it.

## Test plan
reviewer-core: `npm test` (section metadata, `onPrompt`, messages unchanged). server unit: config, `secret-mask` (+ drift test), `prompt-log` payloads, RunLogger mirror. server `.it.test` (via `scripts/checks.sh`): AC-1 to AC-4, AC-10 with a capturing logger that implements `child`.
