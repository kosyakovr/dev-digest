# reviewer-core — @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings. Pipeline: [README.md](README.md).

@INSIGHTS.md

## Commands (npm — NOT pnpm)
- `npm test` (vitest, stubbed `LLMProvider`, no keys)
- `npm run typecheck` (doubles as the build — the package never emits JS)

## Must not break
- `package-lock.json` is off-limits — see root [../CLAUDE.md](../CLAUDE.md).
- No DB, GitHub or filesystem access; the only side effect is the injected `LLMProvider`.
- Consumed as source by `server/` via tsconfig alias — keep `src/index.ts` exports stable
  and run server typecheck/tests after changing them.
- Grounding is mandatory and `score` is recomputed from surviving findings — never trust the model's score.

## Read when
- Changing prompt assembly, output schema or verdict/severity handling → [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Writing tests → [../TESTING.md](../TESTING.md)
- Implementing a feature → [specs/](specs/) · deeper design → [docs/](docs/)
