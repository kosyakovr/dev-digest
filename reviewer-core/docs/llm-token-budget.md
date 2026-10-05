# Sizing `maxTokens` for a reasoning model

The default model, `deepseek/deepseek-v4-flash`, **reasons before it answers**,
and its hidden reasoning counts against `maxTokens`. The reasoning length varies
per call and per upstream provider — measured 0–900 tokens on 2026-10-02.

## What goes wrong

A cap sized for the JSON answer alone cuts the call off mid-answer. The intent
call had `maxTokens: 800`: in a live probe 7 of 10 attempts ended with
`finish_reason: length`, 3 of them with **zero** content. The caller sees
"structured output failed schema validation", never "truncated" — the symptom
points at the schema, the cause is the cap.

## Rule

- Size `maxTokens` for **reasoning plus answer**, not the answer alone. The
  intent call now uses `INTENT_MAX_TOKENS = 3_000`
  (`server/src/modules/intent/constants.ts`). Only generated tokens are billed,
  so a generous cap costs nothing on calls that do not need it.
- When a structured call fails validation, check truncation first:
  `reviewer-core/src/llm/openrouter.ts` reports `finish_reason === 'length'`
  together with `usage.completion_tokens_details.reasoning_tokens`, and says to
  raise `maxTokens`.
- A spec's LLM `NFR-n` states the cap "including reasoning"
  (`docs/specs/_template.md` § Non-functional).

Moved here from the root `INSIGHTS.md` (entry of 2026-10-02) on 2026-10-05.
