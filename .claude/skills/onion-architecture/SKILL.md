---
name: onion-architecture
version: 1.0.0
description: >-
  Backend layering for the DevDigest server: which ring each file belongs to,
  which way dependencies are allowed to point, where Fastify, Drizzle and Zod
  are allowed to appear, when to introduce a port, and how the composition root
  wires it together. Use before creating any new file under `server/src/`,
  before adding a module or a route, when a handler starts querying the
  database, when deciding between a service and a repository, when adding an
  external dependency (HTTP API, LLM, git, filesystem), when a domain type
  starts carrying ORM row shapes, and when reviewing backend structure. Also use
  when the user asks "where should this logic live", "how do I add a server
  module", "why can't the route call the database", "do I need a repository for
  this", "куди покласти цю логіку", "як додати новий модуль на сервері",
  "чому не можна кликати базу з роута", "чи потрібен тут репозиторій".
---

# Onion architecture — DevDigest server

Layering and boundaries only, scoped to `server/`. Sources and the reasoning
behind every contested call are in [README.md](README.md); bad/good pairs on
this repo's real code are in [examples.md](examples.md).

**Not this skill's job:** Fastify route/plugin/hook syntax → `fastify-best-practices`.
Query building, relations, schema syntax → `drizzle-orm-patterns`. Schema
authoring → `zod`. Table design, indexes, types → `postgresql-table-design`.
This skill only says *which layer* each of those belongs in.

The canonical sources disagree on how many rings there should be — Cockburn has
two, Palermo four, Three Dots Labs caps it at three or four. They agree on
exactly one thing: **the direction of dependencies**. So that is what this skill
enforces. It does not invent new rings, and it does not rename the folders this
repo already has.

**Scope of enforcement:** these rules are mandatory for **new** files and new
modules. The known violations in §11 stay as they are — do not refactor them
because you happened to open the file. Fix one only when the task is to fix it.

## 1. The rings, mapped onto this repo

Onion's rings already exist here under different names. Use the repo's names.

| Ring | Lives in | May import |
|---|---|---|
| ① Domain model + ports | `src/vendor/shared/` | `zod`, and nothing else |
| ② Use cases | `src/modules/<name>/{service,helpers,findings}.ts` | ①, own `repository.ts`, `platform/errors`, ports via `Container` |
| ③ Infrastructure | `src/db/`, `src/adapters/`, `src/modules/<name>/repository.ts` | ①, ②, and the real libraries (`drizzle-orm`, `octokit`, `openai`, …) |
| ④ Boundary + composition | `src/modules/<name>/routes.ts`, `src/app.ts`, `src/platform/container.ts` | everything |

Two things this table is saying that are easy to miss:

- **Ring ③ is on the outside, not the bottom.** Palermo's sharpest line is that
  "data access is a top layer". The database is a detail the core is protected
  *from*, not a foundation it is built *on*.
- **`src/platform/` is not a ring.** It is cross-cutting infrastructure
  (`config`, `errors`, `jobs`, `sse`, `container`). `errors.ts` is safe to
  import from anywhere; `container.ts` belongs to ④ and must never be imported
  by a repository.

[`reviewer-core/`](../../../reviewer-core/) is what ring ① looks like when it is
taken seriously: its only dependencies are `zod` and an injected `LLMProvider`,
so the whole review engine runs with no database, no HTTP server and no
filesystem. It is outside this skill's scope, but it is the standard to aim at.

## 2. Anatomy of a module

A module is a vertical slice with the rings *inside* it. The canonical shape is
[`src/modules/repos/`](../../../server/src/modules/repos/) — copy it.

```
modules/<name>/
├── routes.ts       ④ Fastify plugin, default export. The ONLY file importing fastify.
├── service.ts      ② use cases. No HTTP, no SQL.
├── repository.ts   ③ the ONLY file touching this module's tables.
├── helpers.ts      ② pure functions: parsing, mapping, formatting. No I/O.
├── constants.ts    — literals: job kinds, regexes, secret names, limits.
└── types.ts        — only when the module exposes a port to other modules.
```

Rules:

- **Do not create empty files.** A module that is one read query is
  `routes.ts` + `repository.ts`. Add `service.ts` when there is a decision to
  make, `constants.ts` when there is a literal to name. See §12.
- **Open every file with a docblock that names its layer and its prohibition.**
  This is already the de-facto style here and it is the cheapest enforcement
  mechanism in the repo — `repository.ts` says "the ONLY place that touches the
  `repos` table", `helpers.ts` says "Pure functions only — no I/O, no DB, no
  container", `service.ts` says "No HTTP and no raw SQL live here".
- **Register the module** in [`src/modules/index.ts`](../../../server/src/modules/index.ts):
  one import, one entry. Registration is static on purpose (`@fastify/autoload`
  is in `package.json` but deliberately unused — dynamic `import()` of `.ts` is
  not portable across tsx, tsc and vitest).
- A module over ~400 lines in one file splits by ring, not by size — see
  `modules/reviews/`, which peeled `run-executor.ts` off its service and split
  `repository.ts` into a facade over `repository/*.repo.ts`.

## 3. Where does this code go?

| The code is… | It goes in | Example in this repo |
|---|---|---|
| An HTTP route | `modules/<name>/routes.ts` | `modules/repos/routes.ts` |
| A wire contract (request/response shape) | `vendor/shared/contracts/` | `contracts/platform.ts` |
| An interface for anything outside the process | `vendor/shared/adapters.ts` | `LLMProvider`, `GitHubClient` |
| A business decision, orchestration, a workflow | `modules/<name>/service.ts` | `RepoService.add` |
| A long-running background step | its own file in the module | `modules/reviews/run-executor.ts` |
| A SQL query | `modules/<name>/repository.ts` | `RepoRepository.findByFullName` |
| A table definition | `src/db/schema/<domain>.ts` | `db/schema/repos.ts` |
| A row type shared across modules | `src/db/rows.ts` | `AgentRow`, `FindingRow` |
| A row → DTO mapper | `modules/<name>/helpers.ts` | `toRepoDto` |
| A pure transform with no I/O | `modules/<name>/helpers.ts` | `parseRepoUrl` |
| A literal (job kind, regex, limit, secret name) | `modules/<name>/constants.ts` | `CLONE_JOB_KIND` |
| A call to a third-party library or binary | `src/adapters/<tech>/` | `adapters/github/octokit.ts` |
| A test double for a port | `src/adapters/mocks.ts` | `MockGitHubClient` |
| Env-derived configuration | `src/platform/config.ts` | `AppConfig` |
| A secret | never in config — `SecretsProvider` | `adapters/secrets/local.ts` |
| An error type | `src/platform/errors.ts` | `NotFoundError` |
| Cross-cutting runtime machinery | `src/platform/` | `jobs.ts`, `sse.ts` |
| A facade one module exposes to others | `modules/<name>/types.ts` + `Container` | `RepoIntel` |
| Wiring of any kind | `src/platform/container.ts` or `src/app.ts` | — |
| A test needing Postgres | `test/<name>.it.test.ts` | — |
| Any other test | `test/<name>.test.ts` | — |

If two rows seem to fit, pick the **inner** one. Code earns its way outward.

## 4. Direction of dependencies

```
routes.ts  →  service.ts  →  repository.ts  →  db/
    ↓            ↓
 contracts    ports (via container)  →  adapters/
```

Everything points one way, inward and downward. Concretely:

- **`service.ts` must not import `fastify`.** Not the app, not `FastifyRequest`,
  not a reply type. If a use case needs the HTTP status, it throws an `AppError`
  and lets [`app.ts`](../../../server/src/app.ts) translate it.
- **`service.ts` must not import `drizzle-orm`** or `db/schema`. Persistence is
  the repository's job.
- **`repository.ts` must not import `Container`,** a service, or another
  module's repository.
- **`helpers.ts` does no I/O.** No `await`, no `db`, no `container`, no `fetch`.
- **A module never reaches into another module's folder.** Cross-module access
  goes through `container.*` — that is exactly why `agentsRepo`, `reviewRepo`
  and `repoIntel` are constructed in the composition root.
- **An outer ring may call any inner ring directly**, not only the one next to
  it. A route that only reads may call the repository without inventing a
  pass-through service (§12). This is Onion, not strict layering — do not
  over-restrict here.

What may *not* flow inward is just as important: no Fastify types, no Drizzle
types, no `process.env`, no `octokit`/`openai` imports in rings ① and ②.

## 5. Ports and adapters

A port is an interface owned by the inside, implemented by the outside. The
rule already written at the top of
[`vendor/shared/adapters.ts`](../../../server/src/vendor/shared/adapters.ts) is
the rule: *"ALL external calls go behind these interfaces. Services depend on
the interface, not the impl."*

**Introduce a port when** the thing is outside the process — network, disk,
subprocess, clock, randomness — or when a test would otherwise need
infrastructure to run. **Do not introduce a port** for a single implementation
that lives entirely inside one ring. An interface with one implementation and no
boundary to protect is ceremony.

Name a port after the *conversation*, not the technology: `GitHubClient`, not
`OctokitWrapper`; `CodeIndex`, not `RipgrepRunner`.

Three places a port can be declared — pick by blast radius:

| Reach | Declare in | Example |
|---|---|---|
| Used by several modules | `vendor/shared/adapters.ts` | `LLMProvider`, `GitClient` |
| One module's public facade | `modules/<name>/types.ts` | `RepoIntel` |
| One narrow technical concern | `adapters/<tech>/index.ts` | `DepGraph`, `Tokenizer` |

Every port needs three things, and all three are required to land together:

1. A real implementation in `src/adapters/<tech>/`.
2. A lazy getter on [`Container`](../../../server/src/platform/container.ts) plus
   a field on `ContainerOverrides`.
3. A double in [`src/adapters/mocks.ts`](../../../server/src/adapters/mocks.ts),
   declared `implements` so the compiler keeps it honest.

A port that cannot be overridden in tests is not a port.

## 6. Fastify is the boundary, and the composition root

**The handler parses, delegates, and maps the result. Nothing else.**
`modules/repos/routes.ts` is 48 lines for four endpoints; that is the target
density. Business logic in a handler is the single most common violation here
(§11).

- **Validate with a schema, never with `Schema.parse()` in the handler.** Routes
  opt in with `app.withTypeProvider<ZodTypeProvider>()` and declare
  `{ schema: { body, params, querystring, response } }`. The request type is
  then *inferred*, not asserted, and the response is serialized by the same
  contract.
- **Never set an error status by hand.** Throw `NotFoundError`, `ValidationError`,
  `ExternalServiceError` or `AppError` from `platform/errors.ts`. The one
  translator lives in `app.ts` (validation → 422, `AppError` → its own status).
  Success statuses are the handler's business: `reply.status(created ? 201 : 200)`.
- **Tenancy is resolved at the boundary.** Call `getContext(container, req)` in
  the handler and pass `workspaceId` down as a parameter. Services take
  `workspaceId: string`; they do not take a request.
- **Order in `app.ts` is load-bearing:** type-provider compilers → `Container` →
  decorate → ecosystem plugins (helmet, cors, sse, rate-limit) → health → error
  handler → modules. Modules are encapsulated child contexts, so anything they
  must inherit has to be registered before them.
- **The plugin tree is the composition root.** `Container` is built once in
  `app.ts` and decorated onto the instance; nothing else constructs an adapter.
  A `new OctokitGitHubClient(...)` outside `container.ts` is a bug.

Services here take the whole `Container` rather than individual ports. That is a
coarse seam and a deliberate trade-off — see README → Contested. Keep to it for
consistency; do not introduce a DI library.

## 7. Drizzle stays at the edge

The reason for a repository here is **not** that Postgres might be swapped out.
It will not be. The reason is **type containment**: keeping generated row shapes
out of the signatures your use cases are written against.

- **`drizzle-orm` and `db/schema` are importable from `repository.ts` and `db/`
  only.** Not from a service, not from a route.
- **Never expose a Drizzle type above the repository.** No `Db`, no `SQL<T>`, no
  `PgTable`, no bare `$inferSelect` in a signature a service or route reads.
  A row type re-exported by name (`export type RepoRow = typeof t.repos.$inferSelect`)
  is the accepted local form; mapping to the DTO happens in `helpers.ts`.
- **Three type families, and they are not interchangeable:** DB row
  (`$inferSelect`), domain type, wire DTO (`vendor/shared/contracts`). The
  repository owns row→domain; `helpers.ts` owns domain→DTO. A route returning a
  row directly has skipped both.
- **Write mappers by hand, field by field.** No spreading a row into a DTO —
  divergence between the table and the contract must be visible in the diff, and
  a spread silently leaks new columns to the API the day they are added.
- **Name methods after the business operation**, not the query:
  `findByFullName` reads fine, `selectWhereWorkspaceIdAndFullName` does not.
- **Transactions belong to the service.** It knows the business operation's
  extent. Repository methods accept an optional transaction handle.
- **Every query is scoped by `workspaceId`.** This is a tenancy guard, not a
  filter; a query without it is a security bug.
- **One repository style: a class holding `this.db`,** constructed as
  `new XRepository(container.db)`. Free functions taking `db` as the first
  argument also exist in `modules/reviews/repository/` — that is the older style,
  kept behind a facade class. New code uses the class.

## 8. Zod at the perimeter

Parse at the edge; trust the types inside.

- **Parse everything entering the process:** request bodies, params, query
  strings, env vars, GitHub and LLM responses, job payloads, anything out of
  `JSON.parse`. Inside, a typed value is already proven.
- **Do not re-validate in the core.** If a service feels the need to re-parse its
  own input, the boundary is in the wrong place.
- **The schema is the source of truth; derive the type with `z.infer`.** Never
  hand-write an interface next to a schema.
- **A contract is a wire format, not a domain model.** DTOs are `snake_case`
  here because they are the API; domain and DB stay `camelCase`. Do not let one
  naming convention bleed into the other — the mapper exists for this.
- **Mind `z.input` vs `z.output`.** Once a schema has a `.transform()` or a
  `.default()`, the two differ, and a DTO typed with the wrong one will lie.
  Also note `.parse()` returns a deep clone, so it is not free on hot paths.
- **`vendor/shared/` is vendored twice** — in `server/` and in `client/`. Changing
  a contract means changing both copies in the same commit. This is a repo-wide
  invariant, not a style preference.

## 9. Tests follow the rings

The mechanical test of whether the architecture is real:
**a use case must be callable without starting Fastify and without a database.**
If it is not, the layering is broken — the test is only the messenger.

| Subject | How | Naming |
|---|---|---|
| `helpers.ts` | plain unit test, no setup | `test/<name>.test.ts` |
| `service.ts` | `Container` with `ContainerOverrides` from `mocks.ts` | `test/<name>.test.ts` |
| `repository.ts`, adapters | real Postgres via testcontainers | `test/<name>.it.test.ts` |
| routes | `app.inject()` with mock overrides | either, per what it touches |

- **The `.it.test.ts` suffix is mandatory** for anything importing
  `test/helpers/pg.ts` — CI splits the suites on that name.
- **Prefer fakes over mocks.** `mocks.ts` holds working in-memory
  implementations, not assertion spies. Verify the outcome, not the call.
- And the counterweight, because this is a real failure mode: heavy mocking is a
  symptom, not a virtue. If testing one use case needs five configured doubles,
  the use case is doing five things.

## 10. Anti-patterns

| Symptom | Fix |
|---|---|
| `import { eq } from 'drizzle-orm'` in `routes.ts` | move the query to a repository (§7) |
| `db.select()` in a handler | repository, called by the route or a service (§4) |
| `FastifyRequest` in a service signature | pass `workspaceId` and the parsed body (§6) |
| `Schema.parse(req.body)` in a handler | declare it in `{ schema: { body } }` (§6) |
| `reply.status(404)` for a missing row | `throw new NotFoundError(...)` (§6) |
| `$inferSelect` in a service or route signature | map to a domain type or DTO (§7) |
| `return row` from a route | `toXDto(row)` in `helpers.ts` (§7) |
| `{ ...row }` as a DTO | hand-written field mapping (§7) |
| `new OctokitGitHubClient()` outside `container.ts` | a port plus a container getter (§5) |
| `process.env` outside `config.ts` / `secrets/` | `AppConfig` or `SecretsProvider` (§3) |
| A query without `workspaceId` | add the tenancy guard (§7) |
| `import '../other-module/repository.js'` | expose it on `Container` (§4) |
| A new port with no entry in `mocks.ts` | add the double before merging (§5) |
| A service test that needs Docker | inject `ContainerOverrides` (§9) |
| An interface with one impl and no boundary | delete it, use the class (§5) |
| A service that only forwards to a repository | let the route call the repository (§12) |
| The same external call written in two modules | one service, reached via the container (§4) |

## 11. Known exceptions in this repo

These are real and they are staying. New code does not copy them; existing files
are not rewritten in passing.

- **Four modules have no service and no repository** — `pulls`, `polling`,
  `settings`, `workspace` query Drizzle straight from the handler.
  `modules/pulls/routes.ts` is 458 lines and holds GitHub sync, upsert and
  backfill logic inline. `pulls` and `polling` duplicate the same sync.
  These are the reference *bad* cases in [examples.md](examples.md).
- **`platform/container.ts` imports upward from `modules/`** (`AgentsRepository`,
  `ReviewRepository`, `RepoIntelService`). Deliberate: the composition root is
  allowed to know everything, and this is what keeps modules from importing each
  other directly. Do not "fix" it.
- **`platform/jobs.ts` and `adapters/auth/local.ts` query tables directly**,
  bypassing any repository. Accepted for infrastructure that owns its own table
  and has no module.
- **Three modules import adapter functions directly** rather than through the
  container: `reviews/diff-loader.ts` (`parseUnifiedDiff`) and `repo-intel`
  (`parseSymbols`, `langForFile`, …). These are *pure* functions with no I/O, so
  the port would buy nothing — but the import still crosses a ring, so keep it to
  pure functions only.
- **`modules/repos/service.ts` imports `../repo-intel/constants.js`** to enqueue
  the indexing jobs it owns the trigger for. Constants only, no behaviour — but
  it is still a sideways import, so keep the exception to literals and put
  anything executable on the container.
- **Two repository styles coexist** (§7). The class form wins for new code.

## 12. When the full shape is overkill

Three or four rings is the ceiling; six is a smell. A module is not obliged to
have every file.

- **A read-only endpoint over one table** is fine as `routes.ts` +
  `repository.ts`. Do not add a service that only forwards calls — a
  pass-through layer is cost with no benefit.
- **A module with no external dependency** needs no port.
- **Add the layer when the second reason appears:** a second caller, a
  background job, a branch in the logic, a transaction spanning two tables.
- The signal that you went too far: explaining where a change goes takes longer
  than making it.

## 13. Enforcement

No linter enforces any of this today — `tsc --noEmit` and vitest are the only
machine checks. These greps work right now, from `server/`:

```bash
grep -rn "drizzle-orm" src/modules/*/routes.ts                  # DB in the boundary
grep -rn "from 'fastify" src/modules/*/service.ts               # framework in a use case
grep -rn '\$inferSelect' src/modules/*/service.ts               # row types leaking up
grep -rn "from '\.\./[a-z-]*/repository" src/modules --include='*.ts'  # cross-module reach
grep -rn 'process\.env' src --include='*.ts' \
  | grep -v 'platform/config\|adapters/secrets'                 # config bypass
grep -rL 'workspaceId' src/modules/*/repository.ts              # tenancy guard (heuristic)
```

Expected output as of 2026-09-20 — anything else is a regression:

| Check | Expected |
|---|---|
| DB in the boundary | exactly four: `pulls`, `settings`, `polling`, `workspace` (§11) |
| framework in a use case | nothing |
| row types leaking up | nothing |
| cross-module reach | nothing |
| config bypass | `adapters/git/simple-git.ts` (*sets* `GIT_TERMINAL_PROMPT`/`GCM_INTERACTIVE` for subprocesses, does not read config) and `db/migrate.ts` / `db/seed.ts` (standalone scripts with no `AppConfig`) |
| tenancy guard | `repo-intel/repository.ts` — a false positive: it scopes by `repoId`, which the caller has already resolved inside a workspace |

If §11 and the greps disagree, §11 is out of date — update it rather than the
grep. Note the last two checks are heuristics, not rules: read the hit before
calling it a violation.

The table above stays as the human-readable record, but it is no longer the thing
a check compares against. The `pr-self-review` skill runs each pattern with
`git grep` at **both `HEAD` and the merge-base** and reports only the difference,
so every grandfathered hit in §11 cancels mechanically and cannot become a finding
— and the baseline never needs hand-maintaining. See
[`.claude/skills/pr-self-review/greps.md`](../pr-self-review/greps.md).

Stronger enforcement is possible but **ask the user before adding anything**:
lock files are off-limits in this repo.

- `dependency-cruiser` is **already a dependency of `server/`** (it is used at
  runtime to analyse *reviewed* repos, not this one). Layer rules for our own
  graph could be added as a config file with no new package — this is the
  cheapest real upgrade available.
- `eslint-plugin-boundaries` gives in-editor feedback, `ArchUnitTS` expresses the
  rules as Vitest assertions. Both need new dependencies.
