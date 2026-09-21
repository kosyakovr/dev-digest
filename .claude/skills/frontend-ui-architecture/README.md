# frontend-ui-architecture — sources and rationale

Why [SKILL.md](SKILL.md) says what it says. Every rule that could reasonably be argued
the other way is traced to a source here, and where the industry disagrees, that is
recorded rather than hidden.

- **Version:** 1.0.0 · **Researched:** 2026-09-20
- **Targets:** React 19, Next.js 15–16 (App Router), TypeScript 5.x
- **Scope:** structure and boundaries only. Runtime React behaviour →
  `react-best-practices`. Next.js file mechanics → `next-best-practices`.

A note on authority: React's own docs have **no** folder-structure page (only the
legacy FAQ), and Next.js explicitly declines to prescribe one, stating that names like
`components` and `lib` carry no framework meaning. So a large part of this topic has no
first-party answer, and the skill's job is to make a defensible choice and say it is a
choice.

---

## 1. Where components live · colocation and promotion

| Source | Taken from it |
|---|---|
| [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) (Alan Alickovic, maintained through 2025) | The reference feature-folder layout (`app`, `components`, `config`, `features`, `hooks`, `lib`, `stores`, `types`) and, more importantly, **unidirectional architecture** shared → features → app, enforced with `import/no-restricted-paths`. Also "include only necessary folders for each feature" → §3 "do not create empty files". |
| [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) (updated 2026-05-05) | The eight-step progression from one file to a monorepo, and the promotion rule this skill adopts verbatim: promote when **two or more** consumers need it — plus the half everyone forgets, **demote it back** when sharing stops. Singular feature-folder names, plural collection folders. |
| [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) (v16.3, 2026-07-21) | "Next.js is **unopinionated** about how you organize and colocate your project files." Colocation inside `app/` is safe because a folder becomes routable only with `page`/`route`; `_folder` opts a subtree out of routing and its documented benefits include **avoiding collisions with future Next.js file conventions** (why §2 keeps `_components/` even though it is optional). The three sanctioned strategies, and "choose a strategy that works for you and be consistent." Also the explicit disclaimer that `components`/`lib` naming has no framework significance. |
| [React legacy docs — File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html) | The closest thing to an official position: names both approaches without endorsing either, warns to "limit yourself to a maximum of three or four nested folders", and says don't spend more than five minutes choosing. Supports §2's shallow three-level model. |
| [Johannes Kettmann — Screaming Architecture: evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) | The progression flat → by-type → colocated → feature-driven, with thin route files as entry points. (Original domain profy.dev was unreachable during research; the DEV mirror is live.) |
| [Feature-Sliced Design — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) · [Layers](https://feature-sliced.design/docs/reference/layers) | The anti-over-decomposition rule quoted in §2 in spirit: "a good indicator that something needs to be a feature is the fact that it is reused on several pages." Also the segment vocabulary (`api`, `model`, `lib`, `ui`, `config`) — and the fact that FSD has **no `utils` segment at all**. |
| [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) (Eric Diviney, 2025) | Endorses the bulletproof-react layout and adds the pragmatic brake: start flat, organize when patterns emerge. |
| [Josh Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) (2022, **updated 2025-12-03**) | The dissent, kept on purpose. Argues "organized by function" beats by-feature because product needs shift and feature boundaries drift. This skill takes his **component-folder anatomy** (`ComponentName/` with `.helpers.ts`, `.types.ts`, per-component `index.ts`) while rejecting his global `constants.ts` and his by-function top level. |

## 2. Splitting components

| Source | Taken from it |
|---|---|
| [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | The official decomposition rule: "a component should ideally only be concerned with **one thing**. If it ends up growing, it should be decomposed into smaller subcomponents." This is why §4 splits on responsibility, not size. Also the algorithm for locating state's owner (used in §8). |
| [bulletproof-react — Components and Styling](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md) | The prop-count trigger: "If your component is accepting too many props you might consider splitting it into multiple components or use the composition technique." Also "do not add multiple render functions" and "wrap third-party UI components" in your own layer. |
| [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) (book ed. 2025) | Three rules §4 uses directly: group by route/module rather than `containers/`+`components/`; **never define render functions inside a component** ("extract it in its own component, name it and rely on props instead of a closure"); keep pure helpers above the component, taking arguments. Also the critique of container/presentational as concentrating complexity instead of spreading it. |
| [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Cited **for its retraction**: the post carries the author's note that he no longer suggests splitting components this way, because Hooks remove the need for that "arbitrary division". ⚠️ Medium returns 403 to non-browser requests (the link works in a browser), so the exact retraction wording was confirmed only via secondary sources — the skill therefore states the conclusion without quoting it. |
| [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) (2020) | "Avoid Hasty Abstractions" and Sandi Metz's "prefer duplication over the wrong abstraction" → the "do not extract early" clause at the end of §4. |
| [Dan Abramov — Goodbye, Clean Code](https://overreacted.io/goodbye-clean-code/) (2020) | The same warning from the React team side: a de-duplicating refactor became a liability when requirements diverged. "Let clean code guide you. Then let it go." |
| [Dan Abramov — Writing Resilient Components](https://overreacted.io/writing-resilient-components/) (2019) | Constraints on component design used in §8: no component is a singleton (rendering it twice must work), keep local state isolated, don't copy props into state. |

## 3. Constants and configuration

| Source | Taken from it |
|---|---|
| [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/) | `constants.ts` inside the component or feature folder; promote only on second use. §5's default. |
| [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Has **no** `constants/` folder: app-wide and environment-derived settings live in `config/`. This is the config-vs-constants split in §5. |
| [Matt Pocock — Why I Don't Like TypeScript Enums](https://www.totaltypescript.com/why-i-dont-like-typescript-enums) | `as const` over `enum`: enums emit runtime code, break the what-you-see-is-what-you-get property, `const enum` has usage restrictions, and they don't survive type-stripping. |
| [T3 Env — Core docs](https://env.t3.gg/docs/core) · [create-t3-app: env variables](https://create.t3.gg/en/usage/env-variables) | The "one validated config module, never `process.env` in the app" rule: validate at build and run time with a schema, split server vs client, export a typed `env`. Practical trap worth knowing: all env values are strings, so never use boolean coercion on them. |
| [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | The server-side tightening in §5: "**only the Data Access Layer should access `process.env`**". |

Not adopted: Comeau's single global `src/constants.ts` — see Contested.

## 4. `helpers` vs `lib` · why there is no `utils/`

| Source | Taken from it |
|---|---|
| [Yang Lin Zhao — The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/) (2020) | The core argument of §6: "**util is just too loose of a name; it gives no guidance about what should or should not belong in it**", so it "grows seemingly without bounds" until "you begin to lose sense and judgement of whether your new function should even belong there." Both remedies are in the skill: split into narrow domain-named modules, or name the holding pen so the name applies "pressure and shame". |
| [Matti Lehtinen — The Dunghill Anti-Pattern](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/) | The same conclusion from the OO side: replace `Utils` with domain-named modules, or move the function next to the feature that uses it. |
| [Josh Comeau](https://www.joshwcomeau.com/react/file-structure/) | The most usable distinction, adopted in §6's table: *helpers* are **project-specific**, *utils* are **generic and portable** ("could transfer between projects"). This skill keeps his test but routes the portable ones into narrowly named `lib/` modules instead of a `utils/` folder. |
| [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | The ecosystem's most-copied definition: `lib/` = "preconfigured reusable libraries" (your configured client, query client, i18n), `utils/` = shared pure functions. Adopted for `lib/`, rejected for `utils/`. |
| [FSD — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | The strongest structural answer: there is no `utils` segment; generic code goes in `shared/lib/<narrow-name>`. Named libraries, per concern. |
| [Alex Kondov — Clean Architecture in React](https://alexkondov.com/full-stack-tao-clean-architecture-react/) (2024) | The brake on layering in §7: "a **shallow module** exposes too many internals… and hides few details. When you notice that you have a shallow abstraction somewhere, consider **inlining** its functionality." And: don't add a services/repository layer when "there's neither data nor behavior that we need to hide or reuse." |

## 5. Business logic

| Source | Taken from it |
|---|---|
| [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | The load-bearing official guidance for §7: "You don't need to extract a custom Hook for every little duplicated bit of code. **Some duplication is fine.**" · "If your function doesn't call any Hooks, avoid the `use` prefix… write it as a regular function." · keep hooks on "concrete high-level use cases" and avoid lifecycle wrappers (`useMount`, `useEffectOnce`, `useUpdateEffect` are flagged 🔴). · "A good custom Hook makes the calling code more declarative by **constraining what it does**." |
| [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) · [Clean Architecture in React](https://alexkondov.com/full-stack-tao-clean-architecture-react/) | "Data should live close to where it is used"; separate the UI event from the business consequence; let layers **emerge from maintenance needs, not predetermined doctrine** — which is why §7 says "use the outermost tier you actually need". |
| Johannes Kettmann — Path To A Clean(er) React Architecture, [Part 6: Business Logic Separation](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g) · [Part 7: Domain Logic](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg) · [Part 8: where React Query fits](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-8-how-does-react-query-fit-into-the-picture-1b99) (2024) | The most detailed frontend Clean-Architecture adaptation: isolate domain functions that operate on domain models into a module with **no references to the UI framework**, unit-testable without rendering. Supports tier 4. (The original profy.dev URLs no longer resolve — these dev.to posts by the same author are the live copies.) |
| [FSD — `model` segment](https://feature-sliced.design/docs/reference/slices-segments) | Business logic and schemas live in `model`, never in `ui`. |
| [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | Tier 3 on the server: a DAL that "only runs on the server, performs authorization checks, returns safe, minimal Data Transfer Objects". |

Worth stating plainly: **react.dev prescribes nothing beyond custom hooks and plain
functions.** Every services/domain layer above that is community architecture, which is
why §7 makes tier 4 conditional.

## 6. State placement

| Source | Taken from it |
|---|---|
| [react.dev — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | Group related state, avoid contradictory booleans (one `status` union), avoid redundant and duplicated state, avoid deep nesting. |
| [react.dev — Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | "For **each** piece of state, there is a specific component that holds it" — not one global place. Lift to the common parent; "it is common that you will move state down or back up while you're still figuring out where each piece of the state lives." |
| [react.dev — Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) | The escalation order in §8: props → extract a component and pass `children` → context. "If you pass some data through many layers of intermediate components that don't use that data… this often means that you forgot to extract some components along the way." |
| [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Pushing state **down** is a routine refactor, not only an optimization. |
| [bulletproof-react — State Management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md) | The five-bucket taxonomy in §8 (component / application / server-cache / form / URL), and "localize the state as closely as possible to the components that require it". |
| [TkDodo — React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) | "**Resist the urge to sync server data to a different state manager**" — the frontend holds a snapshot it does not own, and copying it bypasses background refetching. |
| [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | Where query code lives: "I keep my Query Keys next to their respective queries, **co-located in a feature directory**", exporting hooks while keys and query functions stay module-local. |
| [TanStack Query — Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) | The official mechanism for sharing a key + fetcher while keeping them colocated. (The docs deliberately do not prescribe file placement — that part is TkDodo's.) |
| [TkDodo — Zustand and React Context](https://tkdodo.eu/blog/zustand-and-react-context) | Why §8 prefers a store created in a provider over a module singleton: prop-based init needs a syncing effect, tests need manual resets, and two instances overwrite each other. |

## 7. Types

| Source | Taken from it |
|---|---|
| [Where Your Types Live Matters More Than You Think](https://blog.serghei.pl/posts/where-your-types-live-matters/) | The three-tier decision procedure in §9, and the constraint on a global `types/`: it should hold "only framework-level plumbing that genuinely belongs to no feature." |
| [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/) · [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Colocated `types.ts` per component/feature; root `types/` only for cross-cutting types. |
| [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | DTOs as the thing that crosses the boundary — a shared contract, not a hand-copied interface. |

## 8. Boundaries, imports, barrels

| Source | Taken from it |
|---|---|
| [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) (2024) | The measured case behind §11: removing barrels in a real Next.js project cut modules loaded from **11,000 → 3,500 (−68%)** and dev startup from 5–10 s to ~3.5 s; barrels invite circular imports; `optimizePackageImports` cannot optimize a barrel that contains any non-re-export line — even one `export const`. The single exception he allows is a **library's public entry point**, which is exactly the carve-out §11 makes for the design system. |
| [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | The reversal, quoted because it is a maintainer changing their mind: "In the past, it was recommended to use barrel files… it can cause issues for Vite to do tree shaking and can lead to performance issues. Therefore, it is recommended to **import the files directly**." Plus "it might not be a good idea to import across the features. Instead, **compose different features at the application level**" → §10. |
| [FSD — Public API](https://feature-sliced.design/docs/reference/public-api) | The most nuanced position, and the one §11 lands closest to: FSD mandates public APIs yet **cites TkDodo in its own docs**, bans `export *` as "BAD CODE", and prescribes **per-component indices** (`shared/ui/button/index.ts`) instead of one folder-wide barrel. Also notes index files don't enforce themselves. |
| [FSD — Layers](https://feature-sliced.design/docs/reference/layers) | The import law behind §10: "a module in a slice can only import other slices when they are located on layers **strictly below**"; same-layer slices cannot import each other, with `@x` as the only escape hatch for genuinely connected entities. |
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) (2019) | The principle under all of §1–3: "**place code as close to where it's relevant as possible**". Named exceptions that legitimately move up: folder READMEs, e2e tests at project root, system-wide docs. Also the benefit that makes feature folders worth it: extraction becomes "copy the folder, publish it." |
| [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) (2023) | The critique this skill answers with §10's explicit direction rule: in bulletproof-react "global files access feature modules and feature modules access global files. There are **no guidelines for these dependencies**, and it may get messy." |
| [Josh Comeau](https://www.joshwcomeau.com/react/file-structure/) | The case *for* per-component `index.ts` (readable editor tabs and imports) and for bundler path aliases over relative `../../` — both adopted. |

## 9. Next.js App Router

| Source | Taken from it |
|---|---|
| [Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) (2026-08) | The framing §12 is built on: "**Code** crosses through imports… **Data** crosses through props, and it must be serializable"; `'use client'` belongs "at the entry to a client subtree, not on every file inside it"; the wrapper recipe that "puts the boundary closer to your application code"; the **owner vs parent** distinction; compound components breaking across the boundary (static properties become undefined → use named exports); and the convention that a function prop must be named `action` or end in `Action`. |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Virality: once a file is `'use client'`, "all of its imports and the components it directly renders are included in the client bundle" — with the carve-out "it does not apply to Server Components passed as children or other props." Also "render providers as deep as possible", and the 16.x correction that installing `server-only`/`client-only` is now **optional**. |
| [React — `'use client'` reference](https://react.dev/reference/rsc/use-client) | The framework-agnostic statement: the directive marks a module *and all transitive dependencies* as client code and "creates a boundary in the **module dependency tree** (not the render tree)"; "a parent-child render relationship does not guarantee the same render environment." Plus the serializable-props allowlist. |
| [Josh Comeau — Making Sense of React Server Components](https://www.joshwcomeau.com/react/server-components/) (2023, upd. 2025) | The clearest teaching version of the same rule: the directive works at module level, and what matters is who **imports and renders**, not who nests. |
| [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security) | §12's data-access doctrine: three approaches with "choose one and avoid mixing them"; a DAL for new projects (server-only, authorizes, returns minimal DTOs, sole reader of `process.env`); thin `"use server"` actions over it; the audit checklist; taint APIs as an extra layer, not a substitute. |
| [Sebastian Markbåge — How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) (2023) | The origin of DAL/DTO: "a Server Component function body should only see data that the current user issuing the request is authorized to have access to"; "this creates a layering where security audits can focus primarily on the Data Access Layer while the UI can rapidly iterate"; "always re-read access control and `cookies()` whenever reading data. Don't pass it as props." ⚠️ Details are stale — synchronous `cookies()`, `middleware.tsx`, taint as "upcoming". |
| [Next.js — Authentication](https://nextjs.org/docs/app/guides/authentication) | The strongest official statement behind §12's last bullet: a layout "does not control whether the rest of the route renders… a layout that hides or swaps them does not stop them from running or from appearing in the RSC Payload", and `return null` in a layout for authorization is **"not recommended"**. Also optimistic (cookie, edge) vs secure (DB, DAL) checks, and "the majority of security checks should be performed as close as possible to your data source." |
| [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) | "Next.js dispatches Server Actions **one at a time per client**" (so they are not an RPC layer), "treat every action as an untrusted entry point", "framework protections are not a substitute for application-level checks", and the design rule in §12: "**send a reference (typically an ID) plus the user's change, and re-read the rest from a trusted source using the session.** Schema validation only checks the shape." Its examples place actions at `app/<segment>/actions.ts`. |
| [Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | The rule that resolves most confusion: "**Fetch data in Server Components directly from its source, not via Route Handlers**" — prerendered components would fail the build, and on-demand renders pay an extra roundtrip. Plus the legitimate uses of route handlers (webhooks, OAuth callbacks, RSS/`.well-known`, proxying, non-HTML, external consumers) and when client fetching is still right. |
| [Next.js — `src` folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) | Constraints if you adopt `src/`: `public/`, config files and `.env.*` stay at root; `src/app` is ignored when a root `app` exists; `proxy.ts` must move inside `src`. |
| [Next.js — Multi-Zones](https://nextjs.org/docs/app/guides/multi-zones) | §14's third escape hatch, with the tradeoff stated officially: "pages that are frequently visited together should live in the same zone to avoid hard navigations." |
| [Vercel — Understanding React Server Components](https://vercel.com/blog/understanding-react-server-components) (2023) | "RSCs are not intended to replace Client Components. A healthy application utilizes both." |

### Next.js structure — community

| Source | Taken from it |
|---|---|
| [FSD — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | The RSC-specific hazard in §12: "if a server-only module is exported from `index.ts`, server-only side effects can propagate into the client module graph when a Client Component imports that slice" → split the entry point (`index.server.ts`). Also the App-Router naming workaround (`_app`, `_pages`). |
| [FSD — The Ultimate Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide) (2026-01) | Thin-route doctrine: "routes should assemble features and widgets, not implement domain logic"; reads in entity `api/`, mutations as `*.action.ts`; route handlers reserved for webhooks. |
| [Alex Kondov — How to Structure Next Applications](https://alexkondov.com/structuring-next-applications/) (2023) | "Leave Next's page only as a light layer on top of your page component", and framework-agnostic business logic. ⚠️ Next 13.3-era; the code (`getServerSideProps`, page-provider objects) is outdated — cited for the layering argument only. |
| [next-forge (Vercel)](https://github.com/vercel/next-forge) · [Vercel Academy — next-forge patterns](https://vercel.com/academy/production-monorepos/next-forge-patterns) | §14's package split: `apps/*` for deployables, `packages/*` by domain, because "clear package boundaries prevent coupling and enable teams to own specific domains". |
| [Turborepo — Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) · [Internal Packages](https://turborepo.dev/docs/core-concepts/internal-packages) | `apps/` + `packages/`, "create packages that have a single purpose", namespace them, and never `../` across package lines. |
| [shadcn/ui — components.json](https://ui.shadcn.com/docs/components-json) | Where the near-universal `components/ui` convention actually comes from: it is a **shadcn CLI alias default, not a Next.js rule**. Worth knowing before treating it as canon. |
| [GitHub Discussion #184740 — folder structure for server actions](https://github.com/orgs/community/discussions/184740) (2026) | "Keep server actions next to their domain (e.g. `app/users/actions.ts`)"; a global `/actions` folder "is unnecessary and usually harms separation of concerns"; reserve `app/api` for HTTP endpoints intended for external consumption. |
| [Next.js Learn — dashboard app](https://nextjs.org/learn/dashboard-app/getting-started) | Vercel's own tutorial uses `app/lib` and `app/ui` — i.e. strategy #2. Recorded because it contradicts the `components/ui` convention above. |

## 10. Enforcement

| Source | Taken from it |
|---|---|
| [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | The zone model (`target`, `from`, `except`, `message`) bulletproof-react uses to stop cross-feature imports and enforce layer direction. |
| [`no-restricted-imports` (typescript-eslint)](https://typescript-eslint.io/rules/no-restricted-imports/) · [ESLint core](https://eslint.org/docs/latest/rules/no-restricted-imports) | Simpler path/pattern bans, and `allowTypeImports` — permit type-only imports across a boundary that values may not cross. |
| [eslint-plugin-boundaries](https://www.jsboundaries.dev/docs/overview/) | Classify files by element type, then allow/deny between groups. Its `entry-point` rule is the tool that enforces "import a folder only through its public file" **without** requiring barrels everywhere — the mechanism §11 relies on conceptually. |
| [Nx — enforce-module-boundaries](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries) | Tag-based constraints (`scope:*`, `type:feature|ui|util`) plus blocking deep imports into a library's internals — monorepo-level, which path rules cannot do reliably. |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [Xebia — Taking frontend architecture serious](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) | Whole-graph CI rules, orphaned-file detection, architecture graphs. Xebia's recommendation, adopted in §15: run **both** — ESLint for in-editor feedback, dependency-cruiser in CI. |
| [Steiger](https://github.com/feature-sliced/steiger) | FSD's own linter: forbidden upward and same-layer imports, `fsd/public-api`. Relevant if §14 leads you to FSD. |
| [Steve Kinney — Architectural Linting (Frontend Masters)](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise) | Framing: architectural lint rules as guardrails that replace reviewer vigilance. |
| [Tim Deschryver — Enforce module boundaries](https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports) · [Matias Kinnunen — ESLint import restrictions](https://mtsknn.fi/blog/eslint-import-restrictions/) | Practical configuration walkthroughs. |

---

## Contested — where the industry disagrees

The skill picks a side on each of these. If your team prefers the other side, that is a
legitimate choice; change the skill rather than mixing both.

| Question | Positions | This skill |
|---|---|---|
| **Barrel files** | *Against:* TkDodo (measured), bulletproof-react (reversed its own advice). *Qualified:* FSD — public API required, `export *` banned, per-component indices. *For:* Comeau (readable tabs), Kettmann (feature `index.js`). | Per-component `index.ts` yes; folder-wide mega-barrels and `export *` no; package entry point yes. |
| **By feature vs by function** | bulletproof-react, FSD, Kondov, Kettmann, Wieruch: by feature. **Comeau: by function** — and his post was updated Dec 2025, so this is live dissent, not a stale one. | By feature/route, with Comeau's component-folder anatomy inside it. |
| **bulletproof-react vs FSD** | Roth: bulletproof-react's global↔feature dependencies are ungoverned and circular-prone; FSD's downward-only layers fix it. Counter: FSD's own docs warn against speculative features/entities and say most projects need only Shared/Pages/App — and FSD deprecated its own `processes` layer. | bulletproof-react-shaped, with FSD's import law made explicit (§10) and FSD offered as the escalation (§14). |
| **What replaces `utils/`** | Narrow domain modules (Zhao, Lehtinen) · helpers-vs-utils by portability (Comeau) · `lib/` + `utils/` (bulletproof-react) · abolish the category (FSD). Comeau's split and FSD's stance are mutually incompatible. | Comeau's *test*, FSD's *outcome*: portable code goes to narrowly named `lib/` modules; no `utils/` at all. |
| **Global `constants.ts`** | Comeau: yes. Wieruch, bulletproof-react: no — per-feature, with `config/` for env. | No global constants file. |
| **Component size limit** | Circulating numbers (50 / 100 / 250 lines) come from Medium, DEV and one wiki — **no authority states one**. The `react-best-practices` skill in this repo says "max 200 lines per component". | Responsibility and prop-count triggers, no line number. Stated as a deliberate divergence from `react-best-practices`. |
| **Container/presentational** | Retracted by its author; attacked by Kondov; defended by nobody in current writing. | Not a rule. Extract hooks and pure functions. |
| **`services/` layer** | Clean-Architecture adaptations (Kettmann) argue for an explicit domain layer; Kondov calls most of them shallow modules to inline; react.dev offers nothing beyond hooks. | Conditional tier 4 — only with real behaviour to hide or reuse. |
| **kebab-case vs PascalCase files** | kebab-everything (Wieruch, Next ecosystem, [Iceland's ADR](https://docs.devland.is/technical-overview/adr/0009-naming-files-and-directories)) vs PascalCase components (Comeau, much of the community). No authority resolves it. | PascalCase for component folders/files, kebab-case for everything else — matching this repo. Consistency is the only real rule. |
| **Atomic design** | Minority position for app code now; Brad Frost himself has said the labels "have never been the point". Survives in design systems, where domain slicing doesn't apply. | Not used. The design system is one layer (§2 level ③), not five. |
| **Features inside or outside `app/`** | Next docs list all three strategies as equally valid; Wieruch and FSD keep features **outside** `app/`; Vercel's own Learn course puts everything **inside** (`app/lib`, `app/ui`). | Route-local UI inside `app/**/_components/`, shared UI outside in `components/` — the docs' third strategy. |
| **Server Actions location** | Per-feature `app/<segment>/actions.ts` (server-actions guide, data-security guide, discussion #184740) vs central `app/actions/` (Next's **authentication** guide). Vercel's docs contradict themselves. | Per-segment, next to the domain. |
| **`lib/` vs `utils/` semantics** | Community: `lib` = infra, `utils` = pure. Wieruch: `lib` = wrapped third-party. Next Learn: `app/lib` = both. Next docs: the names mean nothing. **No authoritative answer exists.** | `lib/` = infrastructure **and** narrowly named shared pure modules; no `utils/`. |
| **tRPC vs Server Actions** | Blog-tier only. | Not covered. The defensible part is the officially grounded one: actions are sequential and mutation-oriented (§12). |

## Claims with no authoritative source

Recorded so nobody mistakes them for established practice:

- **A line-count limit for components.** No authority gives a number.
- **Compound components in 2025-26.** No react.dev page, no current first-tier post.
  Best available: [Patterns.dev — Compound Pattern](https://www.patterns.dev/react/compound-pattern/)
  and [Vercel Academy — Component Composition Patterns](https://vercel.com/academy/nextjs-foundations/component-composition-patterns);
  the strongest evidence is that Radix, Headless UI and React Aria are built on it.
- **Per-feature vs global constants as a stated best practice.** Only low-quality
  sources state it directly; the defensible version is Wieruch's promote-on-second-use.
- **Zustand vs Jotai vs Redux selection criteria.** Content farms only. Citable
  material: bulletproof-react's taxonomy and TkDodo's scoped-store post.
- **Official guidance on `features/` or `modules/` naming**, or on enforcing intra-app
  import boundaries in Next.js. Neither exists; Next.js says folder names carry no
  framework significance, and its [ESLint config page](https://nextjs.org/docs/app/api-reference/config/eslint)
  does not cover architecture rules.
- **Big-tech engineering blogs on React code organization.** Airbnb's frontend
  rearchitecture posts are 2017–2020 and about rendering, not structure; nothing current
  from Shopify, Spotify or Zalando. Deliberately not padded into this list.
- **A canonical Lee Robinson article on project structure** (an X thread and talks
  exist), a Delba de Oliveira piece on organization, or anything from Dan Abramov on
  Next.js project layout.
- **An official React Router statement advocating route colocation as architecture.**
  The file conventions are documented; the architectural argument is secondary.
- **Uncle Bob applied to React** ("Screaming Architecture" for frontend is entirely
  community-authored).

## Outdated advice still in circulation

Flagged because it is what a search will surface first:

- `getServerSideProps` / `getStaticProps` / `pages/api` — Pages Router era.
- `/docs/app/building-your-application/…` URLs — the docs were restructured into
  `/docs/app/getting-started/…` and `/docs/app/guides/…`. The old paths survive under
  `/docs/14/`.
- `middleware.ts` → **`proxy.ts`** (Next.js 16). Most content, including Markbåge's
  post and the FSD guide, still says middleware.
- Synchronous `cookies()` / `headers()` / `params` / `searchParams` — async since 15.
- "You must `npm install server-only`" — optional as of 16.
- `revalidateTag` as the default post-mutation call — 16 added `updateTag` for
  read-your-own-writes; `revalidateTag` with an SWR profile deliberately skips the
  immediate re-render.
- "Add a Route Handler so your Server Component can fetch from it" — actively harmful.
- "`return null` in a layout if unauthorized" — explicitly not recommended.
- Container/presentational as a structuring rule.
- Feature-wide barrel files as the way to define a public API.

---

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-20 | Initial skill. Research pass over official React/Next docs (Next 16.3, React 19), bulletproof-react, FSD, Wieruch, Comeau, Kondov, TkDodo, Kent C. Dodds, Abramov, Turborepo and the linting ecosystem; ~55 sources reviewed, contested and unsourced claims recorded explicitly. |
