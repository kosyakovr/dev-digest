---
name: frontend-ui-architecture
version: 1.0.0
description: >-
  UI architecture and code organization for React + Next.js App Router: where
  components, constants, types, helpers and business logic belong, how to split a
  component, where feature boundaries run, and which imports are allowed to cross
  them. Use before creating any new frontend file or folder, when deciding where
  code should live, when a component grows past one responsibility, when extracting
  a helper or a constant, when moving code between route-local and shared
  locations, when adding a barrel or an alias, and when reviewing frontend
  structure. Also use when the user asks "where should this go", "how do I split
  this component", "куди покласти компонент", "як розбити компонент", "де мають
  лежати константи", "де має бути бізнес-логіка".
---

# Frontend UI architecture

Structure and boundaries only. Sources and the reasoning behind every contested
call are in [README.md](README.md); good/bad pairs are in [examples.md](examples.md).

**Not this skill's job:** React runtime behaviour (derived state, `useEffect`,
memoization, keys, a11y) → `react-best-practices`. Next.js file mechanics
(metadata, `next/image`, fonts, bundling, hydration) → `next-best-practices`.

Next.js is deliberately unopinionated about organization and says folder names like
`components` and `lib` carry no framework meaning. So this is a *chosen* convention.
Its one non-negotiable rule: **be consistent across the project.**

## 1. Where does this file go?

Start here. Find the kind of code, take the path.

| The code is… | It goes in | Example in this repo |
|---|---|---|
| A route (URL exists) | `app/<segment>/page.tsx` — thin, composes only | `client/src/app/agents/page.tsx` |
| UI used by exactly one route | `app/<segment>/_components/<Name>/` | `app/onboarding/_components/AddRepoView/` |
| UI used by 2+ routes | `components/<kebab-group>/<Name>/` | `client/src/components/finding-preview/` |
| A generic design-system primitive (Button, Modal, Badge) | the design system, behind one barrel | `client/src/vendor/ui` → `@devdigest/ui` |
| Constants of one component/feature | `constants.ts` next to it | `.../FindingCard/constants.ts` |
| Pure functions of one component/feature | `helpers.ts` next to it | `.../FindingCard/helpers.ts` |
| Style objects of one component | `styles.ts` next to it | `.../FindingCard/styles.ts` |
| A pure function used app-wide | `lib/<narrow-name>.ts` — never `lib/utils.ts` | `client/src/lib/format.ts`, `lib/github-urls.ts` |
| Configured third-party / infrastructure | `lib/` (client, query client, i18n setup) | `client/src/lib/api.ts`, `lib/providers.tsx` |
| Server/async state access | `lib/hooks/<domain>.ts` | `client/src/lib/hooks/reviews.ts` |
| React context + its provider | `lib/<name>.tsx` | `client/src/lib/theme.tsx`, `lib/repo-context.tsx` |
| A cross-boundary data contract (schema/DTO) | a single contracts module both sides import | `client/src/vendor/shared/contracts/` |
| A type used in one file | that same file |  |
| A type used across one folder | `types.ts` in that folder |  |
| A type used by unrelated modules | `lib/types.ts` (or `types/`) | `client/src/lib/types.ts` |
| A mutation callable from the client (Next) | `app/<segment>/actions.ts`, thin |  |
| Server-side data access + authorization (Next) | a `server-only` data-access module |  |
| User-visible strings | the i18n message catalogue, never inline | `client/messages/<locale>/*.json` |
| A test | next to its subject, `<Name>.test.tsx` | `.../FindingCard/FindingCard.test.tsx` |

If two rows seem to fit, pick the more local one. Code earns its way up, it is not
born shared.

## 2. Where components live: three levels, one promotion rule

```
app/<segment>/_components/<Name>/   ① route-local  — the default for new UI
components/<kebab-group>/<Name>/    ② shared       — used by 2+ routes
<design system>/                    ③ primitives   — generic, domain-free
```

- **Start at ①.** Every new feature component is route-local until proven otherwise.
- **Promote ① → ② when a second route needs it.** Not when you suspect one might.
- **Promote ② → ③ only if it has no domain knowledge left** — no entity names, no
  business rules, just props.
- **Demote when sharing stops.** A component in `components/` with one consumer
  belongs back next to that consumer. This half of the rule is usually forgotten.
- Never import from another route's `_components/`. If two routes need it, that is
  the promotion signal, not an excuse to reach sideways.

In Next.js, colocation inside `app/` is safe: a folder becomes a route only when it
contains `page`/`route`. The `_` prefix is not required for that — use it anyway, so
the folder can never collide with a future Next file convention and so editors sort
route files apart from implementation files.

Group folders under `components/` are `kebab-case` and named by domain
(`diff-viewer/`, `app-shell/`), not by technology (`hooks/`, `containers/`). A group
may own group-level `constants.ts` / `helpers.ts` / `styles.ts` shared by its
members — see `client/src/components/diff-viewer/`.

## 3. Anatomy of a component folder

```
<Name>/
├── <Name>.tsx          # the component — the only file that exports it
├── <Name>.test.tsx     # colocated test
├── constants.ts        # only if there are constants
├── helpers.ts          # only if there are pure functions
├── styles.ts           # only if styles are extracted
├── types.ts            # only if types are shared inside this folder
├── _components/        # only if it has private sub-components
└── index.ts            # single-line re-export
```

Rules:

- **Do not create empty files.** A folder with `<Name>.tsx` + `index.ts` is complete.
  Add the others the moment they have content, not in advance.
- **One exported component per file.** A tiny private sub-component used once may
  stay in the same file; a second consumer moves it into `_components/`.
- `index.ts` re-exports only, one line: `export { X, X as default } from "./X";`
- File naming: **PascalCase** for component folders and component files, `kebab-case`
  for everything else (group folders, `lib/` modules, hooks files). Pick the pair and
  never mix — the industry has no consensus here, consistency is the whole value.

## 4. When to split a component

Split on **responsibility**, not on line count. There is no authoritative line limit
and this skill deliberately does not invent one (see README → Contested).

Extract when any of these is true:

- **Two reasons to change.** The card's layout and the severity-filter logic change
  for different reasons → two components.
- **It owns state nobody else needs.** Push that state down into its own component.
- **A second place needs it.** Extract, then place it per §2.
- **You want to test it alone.** A behaviour worth its own test is worth its own file.
- **Too many props.** Roughly 5–7 is where a component is usually doing several jobs.
  Fix by splitting *or* by composition (`children`, slots), not by adding prop #12.
- **You are mapping a list inline** and the item markup has its own conditionals →
  extract the item component.

Never do these:

- **A render function inside a component** (`const renderRow = () => …`). Extract a
  real component with props instead of a closure over local state.
- **A helper defined inside the component body** when it does not read state. Move it
  out, above the component or into `helpers.ts`, and pass arguments.
- **Deep prop drilling** through components that do not use the data. That is the
  signal you forgot to extract a component and pass `children`.
- **Splitting by technical layer** (`containers/` + `components/`). Container vs
  presentational is not a rule any more — its own author retracted it. Extract logic
  into hooks and pure functions, keep the component whole.

And the counterweight: **do not extract early.** Duplication is cheaper than the
wrong abstraction. Wait for the third occurrence before generalising.

## 5. Constants

- Default: `constants.ts` **next to the component or feature** that uses them.
- Promote to `lib/` only when a second feature needs the same value. Then give the
  module a narrow name (`lib/severity.ts`), never a generic bucket.
- **No global `constants.ts`.** It becomes a junk drawer with no owner.
- Prefer `as const` objects over TypeScript `enum` — enums add runtime output, have
  usage restrictions and do not survive type-stripping.
- **Config is not constants.** Environment-derived values live in one module that
  validates them at startup and exports a typed object; the rest of the app imports
  that, never `process.env` directly. On the server, only the data-access layer reads
  env at all.
- Magic strings that cross a boundary (API status values, severities) belong in the
  shared contract module, not duplicated per side.

## 6. `helpers.ts` vs `lib/` — and why there is no `utils/`

**Do not create a `utils/` folder or a `utils.ts`.** The name says nothing, so nothing
can be excluded from it, and it grows without bound until nobody can judge whether a
new function belongs there. This is the single most reliable structural smell.

Instead:

| Kind of function | Where | Name it by |
|---|---|---|
| Specific to one component/feature | `helpers.ts` in that folder | — |
| Generic, app-wide, portable | `lib/<what-it-does>.ts` | the concern: `format.ts`, `github-urls.ts`, `model-label.ts` |
| Configured third-party or infrastructure | `lib/` | the integration: `api.ts`, `providers.tsx` |

If you already have a `utils.ts`, split it by concern rather than growing it. If you
truly need a holding pen, name it so the name shames it (`unstable-temp-helpers.ts`)
and empty it on purpose.

Everything in `helpers.ts` must be **pure**: arguments in, value out, no React, no
component state, no fetching. That is what makes it testable without rendering.

## 7. Where business logic lives

Four tiers, innermost first. Use the outermost one you actually need.

1. **Pure functions** — `helpers.ts`, or `lib/<name>.ts` when shared. Decisions,
   derivations, formatting, validation. No React. Most business logic is this.
2. **Custom hooks** — only when the logic needs React state, effects or context. A
   function that calls no hooks must not be a hook and must not be named `use*`.
   Keep hooks tied to a concrete use case (`useShellCommands`), never generic
   lifecycle wrappers (`useMount`, `useUpdateEffect`).
3. **Data-access modules** — `lib/api.ts` + `lib/hooks/<domain>.ts` own every call to
   the backend. No `fetch` in a component, ever. On the server (Next), the
   `server-only` data-access layer owns queries, authorization and the DTO it returns.
4. **A services/domain layer** — only when there is real behaviour to hide or reuse
   across several features. A layer that just forwards calls is a shallow module:
   inline it. Do not add `services/` reflexively.

The component itself only orchestrates: read data from a hook, call handlers, render.
If you cannot describe a component's job without the word "and", the logic has leaked
into it.

## 8. Where state lives

Five distinct kinds. Confusing them is the most common architectural mistake.

| Kind | Where |
|---|---|
| Component state | `useState`/`useReducer` in the component that uses it |
| Shared UI state | lifted to the **nearest common owner**, not to the top |
| Server/async data | the query cache via `lib/hooks/*` — **never copied into a store** |
| Form state | a form library, scoped to the form |
| URL state | the router (params, search params) |

- Start local. Lift only when a second component provably needs the same value, and
  only as far as the closest shared parent. Moving state down is a normal refactor,
  not an admission of failure.
- Before context: pass props; then extract a component and pass `children`. Reach for
  context for genuinely tree-wide concerns (theme, session, toasts) and render the
  provider as deep as it can go, not around the whole document.
- Add a global store only when unrelated subtrees must share mutable state. Prefer a
  store instance created in a provider over a module-level singleton: a singleton
  cannot be initialised from props, breaks with two instances, and leaks between tests.
- Server data is a snapshot you do not own. Syncing it into another store disables
  background refetching and creates two sources of truth.

## 9. Types

Same promotion rule as everything else:

- Used in one file → declare it there.
- Shared inside one folder → `types.ts` in that folder.
- Used by unrelated modules → `lib/types.ts`.
- Crosses the network or a package boundary → the shared contract module, defined
  once and imported by both sides. Never re-declare a server type by hand on the
  client. In this repo `src/vendor/shared` is vendored in **both** `client/` and
  `server/` — change both together.

A global `types/` folder should hold only plumbing that genuinely belongs to no
feature. If it is filling up with domain types, those types belong to features.

## 10. Imports and boundaries

The dependency graph must flow one way:

```
design system / contracts  →  lib  →  features & routes
```

- A feature may import **down** (lib, design system, contracts) and **not sideways**
  (another feature's internals) and **not up** (a route).
- Cross-feature need = compose both at the route level, or promote the shared part
  per §2. Never import `app/x/_components/Foo` from `app/y/`.
- A folder's **public surface** is its `index.ts` (or its top component file).
  Do not reach into another folder's `helpers.ts`, `constants.ts` or `_components/`.
- **Use the path alias, not deep relative paths.** `@/lib/github-urls`, never
  `../../../../../../../lib/github-urls`. Anything past `../../` is a smell — either
  use the alias or the file is in the wrong place. (This repo has `@/*` configured in
  `client/tsconfig.json` and 59 deep-relative imports that predate the rule — new and
  edited files use the alias.)
- Design-system imports go through its single barrel (`@devdigest/ui`), never into a
  layer file.

## 11. Barrel files

Barrels have a real cost: they pull unrelated modules into the graph, defeat
tree-shaking, slow the dev server and invite circular imports. So they are allowed
only where they buy something:

**Allowed**
- One component folder: `<Name>/index.ts` re-exporting that component. Small, and it
  keeps editor tabs and imports readable.
- The single entry point of a package or design system (`@devdigest/ui`) — this is a
  real public API.

**Not allowed**
- A folder-wide mega-barrel that re-exports every component of a group or feature.
- `export *` — always name what you export.
- A barrel containing anything besides re-exports. One `export const` in it disables
  the bundler's import optimisation for the whole file.
- Importing a sibling through a barrel when the direct path exists.

## 12. Next.js App Router

**Routes are a composition layer.** `page.tsx` reads params, calls a data function,
renders components. No business logic, no markup beyond layout. Feature code lives in
`_components/` (route-local) or `components/` (shared) — not inline in the page.

**The `"use client"` boundary is architecture, not a detail.**

- Code crosses the boundary through **imports**; data crosses through **props** and
  must be serializable.
- The directive applies to a module and everything it imports — so **put it on the
  leaves**, on the small interactive part, not on a big wrapper.
- It does *not* apply to Server Components passed as `children` or other props. That
  is how a server-rendered subtree lives inside a client shell.
- Rendering relationship ≠ execution environment: what matters is which module
  *imports* the component, not which one nests it.
- Render providers as deep as possible, not around the whole document.
- Compound components break across the boundary — static properties (`Menu.Item`)
  become undefined. Export named components instead.
- A function prop passed to a Client Component must be a server action and should be
  named `action` or `*Action`.
- Keep server-only modules out of the client graph. If a folder's barrel re-exports
  both server and client code, split the entry point.

**Data access.** Pick one approach and stay with it. For a new app: a `server-only`
data-access layer that performs the authorization check, returns a minimal DTO, and is
the only place touching the DB client or env. Then:

- Fetch in Server Components directly from the source. **Do not call your own route
  handlers from a Server Component** — it breaks prerendering and adds a roundtrip.
- Route handlers are a public HTTP surface: webhooks, OAuth callbacks, feeds,
  non-HTML content, external consumers. Not your own UI's reads.
- Server actions are for **mutations**, they run one at a time per client, and they
  are untrusted entry points: re-check authorization inside every one. Keep them thin
  — validate, call the data-access function, revalidate. Put them in
  `app/<segment>/actions.ts`, next to the domain they mutate.
- Send an id plus the change; re-read everything else from a trusted source using the
  session. Schema validation only proves the shape.
- **A layout is not an authorization boundary.** It does not stop nested segments from
  rendering; `return null` in a layout is not a security check.
- Client-side fetching is still right for browser-only APIs and polled data.

## 13. Anti-patterns

| Symptom | Fix |
|---|---|
| `utils/` or `utils.ts` | split by concern into narrowly named modules (§6) |
| Global `constants.ts` | move each constant next to its feature (§5) |
| `../../../../..` in an import | path alias, or the file is misplaced (§10) |
| `fetch` inside a component | a data hook / data-access module (§7) |
| `process.env` sprinkled around | one validated config module; on the server, DAL only (§5) |
| Folder-wide barrel, `export *` | direct imports; keep barrels per component (§11) |
| Importing another route's `_components/` | compose at the route, or promote (§2) |
| `containers/` + `components/` split | extract hooks and pure functions instead (§4) |
| `renderX()` inside a component | a real component with props (§4) |
| A component in `components/` with one consumer | demote it next to that consumer (§2) |
| Server data copied into a store | read it from the query cache (§8) |
| Hook named `use*` that calls no hooks | plain function in `helpers.ts` (§7) |
| `"use client"` at the top of a page or layout | push it to the interactive leaf (§12) |
| Auth check only in a layout or page | check it in the data-access layer and in every action (§12) |
| Types re-declared per side of the network | one shared contract module (§9) |
| Hardcoded UI strings | the i18n catalogue (§1) |

## 14. When this structure is not enough

It is fine for one app with tens of features. Reconsider when:

- **Features keep importing each other.** Consider explicit layers with enforced
  downward-only dependencies (Feature-Sliced Design) rather than more folders.
- **Several deployables share code.** Move shared code into packages: `apps/*` for
  deployables, `packages/*` for everything else, one purpose per package.
- **One app is too large to build or own.** Split by URL prefix into separate
  deployments (Next multi-zones), keeping pages that are visited together together.

Do not adopt a heavier methodology speculatively. Layers you do not need cost more
than the folders they replace.

## 15. Enforcement (opt-in — needs new dependencies)

Conventions decay without a machine check. **All of the below add dependencies, so ask
the user before installing anything** — in this repo lock files are off-limits and
`client/` has no linter at all.

- `import/no-restricted-paths` (eslint-plugin-import) — zones that stop features from
  importing each other and enforce the layer direction.
- `no-restricted-imports` (typescript-eslint) — ban paths or patterns; `allowTypeImports`
  lets type-only imports cross a boundary that values may not.
- `eslint-plugin-boundaries` — classify files, then allow/deny between groups; its
  `entry-point` rule enforces "import a folder only through its public file" without
  requiring barrels everywhere.
- `dependency-cruiser` — whole-graph rules in CI, plus orphaned-file detection and
  architecture graphs. Complements ESLint rather than replacing it.
- Monorepo: package-level boundaries (Nx tags, Turborepo `boundaries`).

Zero-dependency checks that work today:

```bash
grep -rn '\.\./\.\./\.\.' src --include='*.ts' --include='*.tsx'   # deep relatives
grep -rnE '[^a-zA-Z.]fetch\(' src/app src/components --include='*.tsx'  # fetch in UI
grep -rln 'export \*' src                                           # wildcard barrels
find src -name 'utils.ts' -o -name 'utils' -type d                   # the junk drawer
```

The second pattern needs the leading `[^a-zA-Z.]`: a bare `fetch(` also matches
**`refetch()`**, which is a TanStack Query retry handler, not a network call in a
component. It produced four pure false positives in `client/` until 2026-09-20.

These rules have no expected-output baseline, and two of them cannot have a useful
one — `client/` has 56 pre-existing deep-relative imports and 7 wildcard barrels.
The `pr-self-review` skill therefore runs each pattern with `git grep` at **both
`HEAD` and the merge-base and reports only the difference**: new hits surface,
grandfathered hits cancel by construction. See
[`.claude/skills/pr-self-review/greps.md`](../pr-self-review/greps.md).
