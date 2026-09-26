# Sources and rationale — onion-architecture

**Version** 1.0.0 · **Researched** 2026-09-20 · **Targets** Fastify 5, Drizzle
0.38 (postgres-js), Zod 3 + `fastify-type-provider-zod`, Vitest 2, testcontainers
· **Scope** `server/` only

[SKILL.md](SKILL.md) states the rules. This file says where each one came from
and, where the sources disagree, which side the skill took and why.

---

## Canonical: the dependency rule

| Source | Taken from it |
|---|---|
| [Palermo — The Onion Architecture: Part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) (2008) | The original. *"All code can depend on layers more central, but code cannot depend on layers further out from the core."* SKILL.md §4 is this sentence applied to our folders. |
| [Palermo — Part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) (2008) | Classes implement interfaces defined *closer to the centre* (§5). Same-layer use of concrete classes is fine; crossing a layer requires an abstraction. |
| [Palermo — Part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) (2008) | *"Data access is a top layer"* — the framing behind §1's "ring ③ is on the outside, not the bottom". Also the rule that an outer layer may reach **any** inner layer, not just the adjacent one (§4, §12). ⚠️ The widely-copied `/2008/07/…part-3/` URL 404s; the real one is `/2008/08/`. |
| [Palermo — Part 4: After Four Years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) (2013) | The four tenets in their cleanest form, and the author's own correction that *"Onion architecture works just fine without the likes of StructureMap or Castle Windsor"* — the licence for §6's "do not introduce a DI library". |
| [Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) (2005) | Ports as *purposeful conversations*, hence "name the port after the conversation, not the technology" (§5). The stated intent — an app *"developed and tested in isolation from its eventual run-time devices and databases"* — is §9's mechanical test. |
| [Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (2012) | *"Source code dependencies can only point inwards"*, and the crossing-boundaries mechanic: the inner ring owns the interface, the outer ring implements it (§5). |
| [Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) (2017) | Positions Onion as Hexagonal plus DDD-derived inner rings. Used to justify mapping onto existing folder names instead of introducing new vocabulary (§1). |
| [Three Dots Labs — Introducing Clean Architecture](https://threedots.tech/post/introducing-clean-architecture/) (2020) | The clearest prose allowed-import matrix: domain imports nothing, application imports domain, ports never import adapters. §1's table is this, renamed to our folders. |
| [Seemann — Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) (2011) | One composition root, as close to the entry point as possible, container referenced only there. §6's "a `new OctokitGitHubClient(...)` outside `container.ts` is a bug". |
| [Alexis King — Parse, Don't Validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (2019) | *"Push the burden of proof upward as far as possible"* and the "shotgun parsing" anti-pattern → §8's "do not re-validate in the core". |
| [Fowler — PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) (2015) | Layering is for reducing scope of attention, but should not be the *top-level* decomposition. Direct support for §2: modules first, rings inside. |
| [Fowler — Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) (2004, rev. 2007) | The fake/stub/mock taxonomy behind §9's "prefer fakes" and examples.md §9's recording double. |
| [Fowler — AnemicDomainModel](https://martinfowler.com/bliki/AnemicDomainModel.html) (2003) | The caution, and the escape hatch: a *thin* application layer over a rich domain is orthodox, the failure is when all logic ends up in services. See Contested. |
| [Wikipedia — Hexagonal architecture](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) | Lineage (1994 sketch → 2005 Ports & Adapters → 2008 Onion → 2012 Clean) and Fowler's sourced criticism that the hexagon's symmetry hides the asymmetry between provider and consumer. |

## Criticism — what keeps §12 honest

| Source | Taken from it |
|---|---|
| [Miller — The Case Against Clean Architecture](https://jeremydmiller.com/2024/02/12/the-case-against-clean-architecture/) (2024) | The strongest named critique: *"a harmful focus on prescriptive rules"*, layer-first organisation, and over-reliance on abstractions and mocks. §9's counterweight paragraph and §10's "an interface with one impl" row exist because of this. |
| [Three Dots Labs — Is Clean Architecture Overengineering?](https://threedots.tech/episode/is-clean-architecture-overengineering/) (2024) | Concrete thresholds: 3–4 layers, 6+ is over-engineered; interfaces only at boundaries and for mockable I/O; skip it for trivial CRUD. All of §12. |
| [TSH — Hexagonal architecture: overview and best practices](https://tsh.io/blog/hexagonal-architecture/) (2023) | *"If it is a fairly simple CRUD application, it is probably not worth it."* |

## Node / TypeScript / this stack

| Source | Taken from it |
|---|---|
| [Sairyss — Domain-Driven Hexagon](https://github.com/Sairyss/domain-driven-hexagon) | The most complete TS reference implementation, with the boundaries enforced by dependency-cruiser. Confirms modules-with-layers-inside and explicit hand-written mappers. |
| [marcoturi — fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) | Closest published match to our stack (Fastify 5, layers validated in CI). Flow Route → Handler → Domain → Repository. Deltas from us: Awilix instead of a hand-rolled container, TypeBox instead of Zod, raw SQL instead of Drizzle. |
| [Stemmler — Organizing App Logic with the Clean Architecture](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/) | The six kinds of logic (presentation, data-access, application, domain, validation, entity). §3's placement table is a compressed version of that taxonomy. |
| [Stemmler — Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) | Plain constructor injection against interfaces as the TS idiom. Dated (2019) but the idiom holds. |
| [Fastify — Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) | `register()` creates a child context; decorators and hooks flow parent→child only. The mechanical reason §6 insists the error handler and plugins are registered *before* modules. |
| [Fastify — Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | Injection via the options-function form. Supports "the plugin tree is the composition root". |
| [Fastify — Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | Gotchas: no arrow functions in `decorate` (breaks `this`), never decorate request/reply with shared reference types. Relevant to how `container` is attached in `app.ts`. |
| [Fastify — Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/) | The recommended load order that §6's ordering rule follows. |
| [Fastify — Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) | `setValidatorCompiler` + `setSerializerCompiler` + `withTypeProvider<ZodTypeProvider>()` — the mechanism that makes "parse at the edge" real for Fastify, and why §6 forbids `Schema.parse()` in a handler. |
| [Zod — Basics](https://zod.dev/basics) | `.parse()` returns a deep clone; `z.input` and `z.output` diverge once transforms or defaults appear. Both in §8. |
| [Where Zod Ends and the Type System Begins](https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e) | *"Schemas guard the perimeter, types guard the interior"*, plus the enumeration of what must be parsed. §8's first two bullets. |
| [Your Repository Is Not Your ORM](https://dev.to/gabrielanhaia/your-repository-is-not-your-orm-hexagonal-persistence-in-go-4f48) | The best single statement of the leak rule: *"if a signature mentions … a generated row type, the port has leaked."* Also hand-written mappers and keeping operational columns out of the domain. Examples are Go; the rules port directly. |
| [Serban — Drizzle ORM Best Practices](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) (2023) | The only Drizzle-specific source found that states the three type families (DB / domain / API) explicitly, plus transaction boundaries owned by the service and repositories named for business operations. All of §7. |
| [Testcontainers for Node.js](https://node.testcontainers.org/) | The basis for §9's split: fakes for the core, a real Postgres for the adapter. |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | The enforcement option already installed here. Note it has no built-in "layers" primitive — layering is expressed as path-regex `forbidden` rules. |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Alternative with in-editor feedback. Linked to GitHub deliberately: the npm page returns 403 to fetchers. |
| [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) | Architecture rules as Vitest assertions, which would fit this repo's test setup. |
| [How to Actually Enforce Clean Architecture in TypeScript](https://dev.to/argsoftware/how-to-actually-enforce-clean-architecture-in-typescript-1o4a) (2026) | A ready-made rule list, and one genuinely good operational point: fail rule-sets that match zero files, so a typo'd glob cannot pass silently. |

---

## Contested — where the industry disagrees, and what this skill picked

| Question | Positions | This skill |
|---|---|---|
| How many rings? | Cockburn 2 · Palermo 4 · Martin 4 · Stemmler 2 · Three Dots 3–4 | Enforces **direction, not count**. The four sources agree on direction and nothing else. §1 has four names because this repo already has four kinds of folder. |
| Layers or vertical slices at the top? | Palermo and Martin present concentric layers as *the* organising principle; Fowler warns against layering as top-level decomposition; Miller attacks it outright | **Modules first, rings inside** — the resolution both leading TS exemplars (Sairyss, marcoturi) reached independently, and what `src/modules/` already is. |
| Is the repository worth it with a type-safe ORM? | B12/B13 say yes; Miller and Three Dots say do not abstract for a single implementation | Kept, but the **justification is changed**. "Postgres might be swapped" is not credible here and §7 does not claim it. The honest argument is **type containment**: `$inferSelect` shapes must not appear in use-case signatures. That benefit is immediate and holds with exactly one implementation. |
| Anemic domain model? | Fowler calls it an anti-pattern; the Node/TS ecosystem, and the Zod-first idiom of inferring types from schemas, push hard toward data-without-behaviour | Accepts the anemic style this repo already has, with Fowler's own escape hatch as the boundary: **invariants belong with the type, orchestration and I/O sequencing belong in the use case.** Not a hill worth dying on in a Zod-typed codebase. |
| DI container? | Palermo 2008 leans on one, Palermo 2013 retracts the necessity; Sairyss uses NestJS, marcoturi uses Awilix; Fastify's plugin tree needs none | **No library.** The hand-rolled `Container` plus Fastify's plugin scoping already satisfies Seemann's composition-root criterion. Lock files are off-limits here anyway. |
| Inject the container or individual ports? | Constructor-injecting each port is the textbook form and gives a precise seam | **Inject the whole `Container`**, because that is what all five existing services do and consistency beats purity here. The cost is acknowledged in §6: a service can reach any dependency, so the seam is coarse and the constructor no longer documents what the service actually uses. Revisit if a service's true dependency set ever becomes a review question. |
| Mocks at the boundary? | Fowler treats classicist vs mockist as a style choice; Miller treats heavy mocking as a symptom of Clean Architecture done badly | Fakes for ports, testcontainers for adapters, and §9 states the counterweight explicitly rather than pretending mocking is free. |

## Claims with no authoritative source

- **"Fastify decorators are the service-sharing mechanism."** Widely done — this
  repo decorates `container` onto the instance — but the Fastify docs do not
  frame decorators that way. It is community convention, so §6 describes what we
  do without claiming doc support.
- **The `.it.test.ts` suffix** and the `constants.ts` / `helpers.ts` file names
  are local convention with no external backing. Their value is consistency,
  not correctness.
- **"A module over ~400 lines should split."** No source supports any specific
  number; §2 gives the figure only as an observation about
  `modules/pulls/routes.ts` and states the real criterion is rings, not size.

## Outdated advice still in circulation

- **"Onion requires an IoC container."** True of Palermo's 2008 examples,
  retracted by the author in 2013. Still repeated in derivative blog posts.
- **"The repository exists so you can swap the database."** Almost never
  exercised, and unpersuasive with a typed ORM. Kept out of §7 on purpose.
- **Four mandatory top-level folders named after layers** (`domain/`,
  `application/`, `infrastructure/`, `presentation/`). Contradicted by Fowler
  and by both modern TS exemplars; would also require restructuring a codebase
  that is already organised correctly by module.
- **Zod 4 syntax.** This repo is on **Zod 3**. `zod.dev` documents 4.x, so check
  before copying anything from it — `z.coerce`, `.transform()` and `safeParse`
  behave the same, but error customisation and `z.record` signatures do not.

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-20 | Initial. Rules derived from `modules/repos/` as the canonical shape; §11 exceptions verified by grep against the tree at commit `897ed90`. |
