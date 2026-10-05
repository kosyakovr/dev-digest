# `pr_files` — who writes it, and when

`pr_files` (a PR's changed files) is written **only** by `GET /pulls/:id`: that
route re-fetches the PR from GitHub, deletes the PR's rows and inserts the fresh
list (`server/src/modules/pulls/routes.ts`, the `t.prFiles` delete and insert).
PR import and the PR list never write it.

## Consequence

Any reader keyed on `pr_files` that is not the web app's PR page — an MCP tool,
a script, a `curl` — sees **0 changed files** for a PR nobody has opened in the
browser. `GET /pulls/:id/blast` then answered "0 symbols", as a normal result,
not as degraded (found 2026-10-02, L04 Blast radius).

## Rule

Call `GET /pulls/:id` first, then the route that reads `pr_files`.
`mcp-server/src/usecases/blast.ts` does this through `syncPull` before asking
for the blast radius; a new non-browser reader must do the same, or the server
must start writing `pr_files` on import (a design change — spec it first).

Moved here from the root `INSIGHTS.md` (entry of 2026-10-02) on 2026-10-05.
