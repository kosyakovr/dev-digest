# Intent Layer — the `## Stated intent` prompt slot (reviewer-core)

**Status:** in-progress
**Lesson / ticket:** L03

One spec for the feature:
[../../server/specs/L03-intent-layer.md](../../server/specs/L03-intent-layer.md).
This file records only the pure-engine part.

## Contract
- `ReviewIntent { statement, inScope, outOfScope, confidence: 'high'|'medium'|'low' }`
  (exported type), optional `PromptParts.intent` and `ReviewInput.intent`.
- Rendered right after `## PR description`, before `## Skills / rules`:
  `## Stated intent (derived from author-controlled text — may be wrong; confidence: <c>)`,
  an `<untrusted source="intent">` block (`Intent:`, `In scope:`, `Out of scope:`),
  then a trusted caution line.
- Caution line by confidence (exported constants `INTENT_CAUTION_HIGH_MEDIUM`,
  `INTENT_CAUTION_LOW`): high/medium allow a separate scope finding of at most
  WARNING while a real defect keeps its true severity, including CRITICAL; low says
  the intent is a weak hint and findings must not be raised solely because the diff
  differs from it. Neither ever lowers or excuses a real defect.
- Wrapped content capped at `MAX_INTENT_CHARS = 2000`; `</untrusted>` is escaped by `wrapUntrusted`.
- Omitted when `intent` is undefined or `statement.trim() === ''`: the prompt is then
  byte-identical to before. `PromptAssembly.intent` = the section text or `null`.
- Intent is context only: reviewer-core never filters or downgrades findings by it.

## Test plan
Deferred in this iteration (`reviewer-core/test/prompt.test.ts`, `run.test.ts` when added).
