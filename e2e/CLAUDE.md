# e2e — @devdigest/e2e

Deterministic browser flows driven by agent-browser (CDP, no LLM). How flows work: [README.md](README.md).

@INSIGHTS.md

## Commands (npm — NOT pnpm)
- `./scripts/e2e.sh` from repo root (or `npm run e2e:hermetic`) — isolated, freshly-seeded stack. Preferred.
- `npm test` — against your own running stack; only safe if the DB holds just the seeded repo.
- `npm run typecheck`

## Must not break
- `package-lock.json` is off-limits — see root [../CLAUDE.md](../CLAUDE.md).
- `specs/NN-name.flow.json` are the executable specs; `*.md` next to them are written specs.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command.
- Flows target read-only seeded data (`acme/payments-api`, PR #482) — nothing may trigger a model call.
- Never run `docker compose down -v` — it wipes the dev DB volume.

## Read when
- Adding or changing a flow → [README.md](README.md) · [specs/README.md](specs/README.md)
- CI / suite strategy → [../TESTING.md](../TESTING.md)
- Deeper design → [docs/](docs/)
