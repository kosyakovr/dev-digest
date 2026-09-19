# server — @devdigest/api

Fastify 5 + Drizzle/Postgres (pgvector). Overview & diagrams: [README.md](README.md).

@INSIGHTS.md

## Commands (pnpm)
- `pnpm dev` (:3001) · `pnpm typecheck`
- unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'` (no Docker)
- integration: `pnpm exec vitest run .it.test` (Docker)
- `pnpm db:migrate` applies existing migrations (NOT applied on boot)

## Must not break
- Migrations and `pnpm-lock.yaml` are off-limits — see root [../CLAUDE.md](../CLAUDE.md).
- DB-backed tests (import `test/helpers/pg.ts`) MUST end in `.it.test.ts`.
- `package.json` is skip-worktree — don't add scripts CI relies on.
- New module = `src/modules/<name>/` + register in `src/modules/index.ts`.
- External calls go through adapters/DI; tests use `src/adapters/mocks.ts`.
- Secrets never in DB or git — only via `LocalSecretsProvider`.

## Read when
- Touching indexing / repo map → [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md)
- Changing the review prompt → [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Writing tests → [../TESTING.md](../TESTING.md)
- Implementing a feature → [specs/](specs/) · deeper design → [docs/](docs/)
