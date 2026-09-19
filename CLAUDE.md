# DevDigest

Local-first AI PR review. Four standalone packages — NO workspace: each has its own
lockfile. Run commands from inside the package, never from root.

| Package | PM | Guide |
|---|---|---|
| server/ | pnpm | [server/CLAUDE.md](server/CLAUDE.md) |
| client/ | pnpm | [client/CLAUDE.md](client/CLAUDE.md) |
| reviewer-core/ | npm | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| e2e/ | npm | [e2e/CLAUDE.md](e2e/CLAUDE.md) |

Cross-package lessons learned (per-package ones live in `<pkg>/INSIGHTS.md`):
@INSIGHTS.md

## Do not touch — migrations and lock files

Never create, edit, delete, rename or regenerate these files. If a task seems to
require it, stop and ask the user first.

- **DB migrations:** everything under `server/src/db/migrations/` — the `*.sql`
  files and `meta/` (`_journal.json`, `*_snapshot.json`). Do not run
  `pnpm db:generate`. Changing `server/src/db/schema*` implies a new migration,
  so ask before changing the schema too.
- **Lock files:** `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`,
  `reviewer-core/package-lock.json`, `e2e/package-lock.json`, `skills-lock.json`.
  Do not add, remove or upgrade dependencies (`pnpm add/remove/update`,
  `npm install <pkg>`). To install deps use only `pnpm install --frozen-lockfile`
  or `npm ci`.

## Documentation map — read before acting
- Architecture / review flow → [README.md](README.md)
- Adding or changing tests, CI → [TESTING.md](TESTING.md)
- Editing reviewer prompts → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
- Per-package: `<pkg>/README.md`, `<pkg>/docs/`, `<pkg>/specs/`, `<pkg>/INSIGHTS.md`

## Workflow
1. Before the first edit in a package, read `<pkg>/INSIGHTS.md`. Treat it as
   high-confidence guidance unless told otherwise.
2. New feature → write/find its spec in `<pkg>/specs/` first.
3. Learned something non-obvious → capture it with the `engineering-insights`
   skill, which routes it to the right `INSIGHTS.md`. Do not skip this at the end
   of a task that involved debugging, a failing test or a correction — but write
   nothing if nothing new cleared its gate.
4. Changed behaviour described in README/docs → update them in the same change.

## Cross-package invariants
- `@devdigest/shared` Zod contracts are vendored in BOTH `server/src/vendor/shared`
  and `client/src/vendor/shared` — change them together.
- reviewer-core is consumed as source via tsconfig alias → its changes trigger `server-unit` CI.
