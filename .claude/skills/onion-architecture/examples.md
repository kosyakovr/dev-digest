# Examples

Bad/good pairs for [SKILL.md](SKILL.md). Paths are from `server/` in this repo.
Where a "bad" block is real code that ships today, it is marked **(real)** and
the file is named — those are the §11 known exceptions, kept as-is. Blocks
marked **(constructed)** are illustrations; no such code exists here.

---

## 1. A route that queries the database

**Bad (real — `src/modules/workspace/routes.ts`)**

```ts
import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

export default async function workspaceRoutes(app: FastifyInstance) {
  const { container } = app;

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const repos = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    return {
      workspaceId,
      cloneDir: container.config.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        clone_path: r.clonePath,
        last_polled_at: r.lastPolledAt?.toISOString() ?? null,
        cloned: Boolean(r.clonePath),
      })),
    };
  });
}
```

Three rings in one function: transport, persistence and DTO mapping. Nothing
here can be tested without Postgres, and the row shape reaches the response
directly — add a column to `repos` and it appears in the API unannounced.

**Good**

```ts
// repository.ts  ③
export class WorkspaceRepository {
  constructor(private db: Db) {}

  /** Repos in a workspace, for the overview surface. */
  async listRepos(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }
}

// helpers.ts  ②
export function toWorkspaceRepoDto(row: RepoRow): WorkspaceRepo {
  return {
    id: row.id,
    full_name: row.fullName,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    cloned: Boolean(row.clonePath),
  };
}

// routes.ts  ④
app.get('/workspace', async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  const rows = await repo.listRepos(workspaceId);
  return {
    workspaceId,
    cloneDir: app.container.config.cloneDir,
    repos: rows.map(toWorkspaceRepoDto),
  };
});
```

Note what is **not** here: a `WorkspaceService`. This endpoint makes no
decision, so a service would only forward the call (SKILL.md §12). The route
calling the repository directly is correct — an outer ring may reach any inner
ring.

---

## 2. The shape to copy

**Good (real — `src/modules/repos/routes.ts`)**

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);
  service.registerCloneJobHandler();

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

Four endpoints in 48 lines. The handler parses (schema), resolves tenancy,
delegates, and chooses a success status. `req.body.url` is typed because the
schema declared it — no `parse()` call in sight.

---

## 3. Validating by hand instead of by contract

**Bad (constructed)**

```ts
app.post('/repos', async (req, reply) => {
  const body = RepoInput.parse(req.body);          // throws a raw ZodError
  ...
});
```

The error escapes as a 500 instead of the structured 422 that `app.ts` produces
for schema failures, the response is not serialized against any contract, and
`req.body` stays `unknown` for every other line in the handler.

**Good**

```ts
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  // req.body is RepoInput, inferred
});
```

---

## 4. Setting error statuses in the handler

**Bad (constructed)**

```ts
app.get('/repos/:id', async (req, reply) => {
  const repo = await service.get(workspaceId, req.params.id);
  if (!repo) return reply.status(404).send({ error: 'not found' });
  return repo;
});
```

The error shape is now invented per route, and the service cannot express
"missing" to any other caller — a job or another service gets `undefined` and
has to guess.

**Good (real — `src/platform/errors.ts` + `src/app.ts`)**

```ts
// service.ts
const repo = await this.repo.getById(workspaceId, id);
if (!repo) throw new NotFoundError(`Repo ${id} not found`);
return toRepoDto(repo);
```

One translator in `app.ts` turns it into the standard body with the right
status, for every route and every caller.

---

## 5. Fastify types reaching a use case

**Bad (constructed)**

```ts
export class RepoService {
  async add(req: FastifyRequest): Promise<Repo> {
    const { workspaceId } = await getContext(this.container, req);
    ...
  }
}
```

The use case is now callable only from HTTP. The clone job, a CLI, and a test
all have to fabricate a request object.

**Good (real — `src/modules/repos/service.ts`)**

```ts
async add(workspaceId: string, userId: string, url: string): Promise<{ repo: Repo; created: boolean }>
```

Tenancy is resolved at the boundary and passed down as data. The same method
serves the route and the background job.

---

## 6. ORM row types leaking upward

**Bad (constructed)**

```ts
// service.ts
async list(workspaceId: string): Promise<(typeof t.repos.$inferSelect)[]> {
  return this.repo.list(workspaceId);
}
```

The service now imports `db/schema`, so ring ② depends on ring ③, and every
consumer is typed against the table. Renaming a column becomes an API change.

**Good (real — `src/modules/repos/`)**

```ts
// repository.ts  ③ — the row type is named here and stays here
export type RepoRow = typeof t.repos.$inferSelect;

// helpers.ts  ② — the crossing point, hand-written
export function toRepoDto(row: RepoRow): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner: row.owner,
    full_name: row.fullName,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}

// service.ts  ② — speaks the contract
async list(workspaceId: string): Promise<Repo[]> {
  return (await this.repo.list(workspaceId)).map(toRepoDto);
}
```

The mapper is also where `camelCase` becomes the API's `snake_case` and a `Date`
becomes an ISO string. Both conversions are the boundary's job, not the
database's and not the UI's.

> Live nuance: `repos/helpers.ts` writes the parameter as
> `typeof t.repos.$inferSelect` inline, so `helpers.ts` imports `db/schema`.
> Prefer importing the named `RepoRow` from the repository — same type, one less
> ring crossed.

---

## 7. Spreading a row into a DTO

**Bad (constructed)**

```ts
return { ...row, last_polled_at: row.lastPolledAt?.toISOString() ?? null };
```

Every column the table ever gains is published to the API the moment it is
added — including `deleted_at`, internal counters, and anything a migration
brings along. Nothing in the diff will show it.

**Good** — enumerate the fields, as in §6. The cost is one line per field; the
benefit is that schema drift shows up in review.

---

## 8. Constructing an adapter outside the composition root

**Bad (constructed)**

```ts
// modules/pulls/service.ts
import { Octokit } from 'octokit';

const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
const { data } = await gh.rest.pulls.list({ owner, repo });
```

Two rules broken at once: the use case is bound to a library, and it reads a
secret from the environment. It cannot be tested without a network, and the
token now has a second source of truth.

**Good (real — `src/vendor/shared/adapters.ts` + `src/platform/container.ts`)**

```ts
// service.ts — depends on the port, not the library
const github = await this.container.github();
const pulls = await github.listPulls(owner, name);
```

`Container.github()` resolves the token through `SecretsProvider`, constructs
`OctokitGitHubClient` once, and caches it. In a test,
`ContainerOverrides.github` supplies `MockGitHubClient` and no network is
touched.

---

## 9. Adding a port

**Bad (constructed)** — a new `adapters/slack/index.ts` with a concrete class,
imported straight into a service.

**Good** — four files move together:

```ts
// 1. vendor/shared/adapters.ts  ①  — the conversation, not the vendor
export interface Notifier {
  notify(channel: string, message: string): Promise<void>;
}

// 2. adapters/slack/index.ts  ③
export class SlackNotifier implements Notifier { ... }

// 3. platform/container.ts  ④
export interface ContainerOverrides { notifier?: Notifier; /* … */ }

get notifier(): Notifier {
  if (this.overrides.notifier) return this.overrides.notifier;
  return (this._notifier ??= new SlackNotifier(this.config));
}

// 4. adapters/mocks.ts  ③
export class MockNotifier implements Notifier {
  readonly sent: { channel: string; message: string }[] = [];
  async notify(channel: string, message: string) { this.sent.push({ channel, message }); }
}
```

The mock is a **fake** — it records and can be asserted on afterwards — not a
spy configured up front. And note it is `implements Notifier`, so the port and
its double can never drift.

---

## 10. Reaching into another module

**Bad (constructed)**

```ts
// modules/reviews/service.ts
import { AgentsRepository } from '../agents/repository.js';

const agents = new AgentsRepository(this.container.db);
```

Now `reviews` owns a second instance of another module's data layer, and any
change to `AgentsRepository`'s constructor breaks a module that does not look
like it depends on it.

**Good (real — `src/platform/container.ts`)**

```ts
// container.ts — cross-cutting repositories are built in the composition root
get agentsRepo(): AgentsRepository {
  return (this._agentsRepo ??= new AgentsRepository(this.db));
}

// modules/reviews/service.ts
const agents = await this.container.agentsRepo.listForRepo(workspaceId, repoId);
```

This is also why `container.ts` importing from `modules/` is accepted rather
than forbidden (SKILL.md §11): the composition root absorbs the coupling so the
modules do not have to.

---

## 11. Duplicating an external workflow

**Bad (real — `src/modules/pulls/routes.ts` and `src/modules/polling/routes.ts`)**

Both files fetch pull requests from GitHub and upsert them into
`t.pullRequests` with `onConflictDoUpdate`, inline in their handlers. The same
sync logic, written twice, drifting independently. A fix to one is a silent bug
in the other.

**Good** — one `PullSyncService`, exposed on the container, called by both
routes. The behaviour lives in ring ②, where it can be tested once with
`MockGitHubClient` and no database.

---

## 12. A test that needs Docker to check a decision

**Bad (constructed)**

```ts
// test/repos.it.test.ts
const { db } = await startPostgres();
const container = new Container(config, db);
const service = new RepoService(container);
await service.add(ws, user, 'https://github.com/a/b');   // real clone attempted
```

Testing a branch in the business logic should not require a container runtime or
a network.

**Good**

```ts
// test/repos.test.ts — no suffix, no Docker
const container = new Container(config, fakeDb, {
  git: new MockGitClient(),
  secrets: new MockSecrets({ GITHUB_TOKEN: 'x' }),
});
await new RepoService(container).runCloneJob({ repoId, owner, name, url });
```

Keep the `.it.test.ts` suffix for what genuinely needs Postgres: the repository
and the adapters. If a service test cannot escape the database, the service is
doing persistence work that belongs one ring out.

---

## 13. A service that only forwards

**Bad (constructed)**

```ts
export class SettingsService {
  constructor(private container: Container) { this.repo = new SettingsRepository(container.db); }
  list(workspaceId: string) { return this.repo.list(workspaceId); }
  get(workspaceId: string, key: string) { return this.repo.get(workspaceId, key); }
}
```

Every method is a pass-through. The layer adds a file, an indirection and a
constructor, and answers no question.

**Good** — the route calls `SettingsRepository` directly, and the service
appears the day there is a decision to make: validating a model id against the
price book, invalidating `container.invalidateSecretCaches()` after a key
changes, or fanning a write out to two tables.
