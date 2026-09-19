# client — @devdigest/web

Next.js 15 (App Router) + React 19 + TanStack Query. Overview & route map: [README.md](README.md).

@INSIGHTS.md

## Commands (pnpm)
- `pnpm dev` (:3000) · `pnpm typecheck`
- `pnpm test` (vitest + jsdom, `fetch` mocked — no API needed)

## Must not break
- `pnpm-lock.yaml` is off-limits — see root [../CLAUDE.md](../CLAUDE.md).
- Data access only via hooks in `src/lib/hooks/*` → `src/lib/api.ts`; no ad-hoc `fetch` in components.
- Pages stay thin; feature logic lives in colocated `_components/<Name>/` with its own `*.test.tsx`.
- UI strings go to `messages/<locale>/*.json` (`next-intl`), not hardcoded.
- `src/vendor/shared` is also vendored in `server/` — change both together.

## Read when
- Using or adding UI primitives → [src/vendor/ui/README.md](src/vendor/ui/README.md)
- Changing a user journey covered by browser flows → [../e2e/README.md](../e2e/README.md)
- Writing tests → [../TESTING.md](../TESTING.md)
- Implementing a feature → [specs/](specs/) · deeper design → [docs/](docs/)
