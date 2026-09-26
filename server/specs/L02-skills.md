# Skills — reusable prompt blocks

**Status:** done
**Lesson / ticket:** L02

## Goal

An agent is provider + model + one system prompt, so every reusable rule (a
security checklist, a house convention, a review rubric) has to be copy-pasted
into each agent's prompt and drifts independently thereafter.

A **skill** makes such a block first-class: a named, typed, versioned markdown
document owned by the workspace, attachable to many agents. The attachment order
decides where each block lands in the assembled prompt.

A skill is **pure text**. It has no executable part, no tool access and no
runtime of its own — it contributes exactly one markdown block to the prompt
(`## Skills / rules`, rendered by `reviewer-core`'s `assemblePrompt`) and
nothing else.

Serves: anyone maintaining reviewer agents in the studio (the Skills page and
the Agent Editor's Skills tab).

## Non-goals

- **Community / URL import.** The design's "Import from URL" and "Search
  community skills" entries are out of scope; only a local `.md` file is
  accepted. Archive (`.zip`) import is explicitly deferred — no zip library
  exists in any package and lock files are off-limits.
- **Eval panel.** The design's third pane (recall / precision / citation per
  skill) has no backend and is not built.
- **Versioning name/description/type.** `skill_versions` snapshots the body
  only; renaming a skill or changing its type does not create a version.
- **Author notes on a version.** `skill_versions` has no `message` column and is
  not getting one — a version card is labelled by its number and `created_at`.
- **Bumping the agent version when its skill links change.** `setSkills` /
  `linkSkill` do not touch `agents.version`, even though
  `agent_versions.config_json` snapshots the ordered skill ids. Reordering
  therefore changes the assembled prompt without producing a new agent version.
  Pre-existing behaviour, left as is.
- **Skill-level provider/model overrides.** A skill is text; it never selects a
  model or a strategy.

## Contract

### New DB objects (migration `0011_add_skill_types`)

- `skill_types (id, workspace_id → workspaces cascade, name, created_at)`,
  `UNIQUE (workspace_id, name)` — the dropdown's source of truth.
- `agent_skills.enabled boolean NOT NULL DEFAULT true` — per-link toggle,
  independent of the skill's own `enabled`.

`skills`, `skill_versions` and `agent_skills` already exist (`0000_init.sql`).
`skills.type` is plain `text` with no CHECK constraint, so accepting arbitrary
user-authored type names needs no SQL — only widening the Drizzle enum.

### Contracts (`@devdigest/shared`, vendored in both packages)

- `SkillType`: `z.enum([...])` → `z.string().min(1)`; the four original names
  survive as an exported `BUILTIN_SKILL_TYPES` const.
- `SkillTypeItem = { id, name }` — new.
- `SkillVersion = { skill_id, version, body, created_at }` — new, mirrors
  the existing `AgentVersion`.
- `AgentSkillLink` gains `enabled: boolean`.

### Routes

```
GET    /skills                                list (workspace-scoped)
GET    /skills/:id                            one
POST   /skills                                create → 201
PUT    /skills/:id                            update; a body change bumps version + snapshots
DELETE /skills/:id                            → { ok: true }
GET    /skills/:id/versions                   newest first
GET    /skills/:id/versions/:version          one snapshot
POST   /skills/:id/versions/:version/restore  truncate history to :version
GET    /skill-types                           dropdown source
POST   /skills/import/preview                 parse markdown → preview, persists nothing
```

Agent side (existing module, extended):

```
GET    /agents/:id/skills                     linked skills, ordered, with `enabled`
POST   /agents/:id/skills                     set/reorder (now accepts per-link `enabled`)
DELETE /agents/:id/skills/:skillId            unlink one  (new route; repo method existed)
```

### UI surface

- `/skills` — card grid (name, type chip, description, enabled toggle) + search
  + `Add skill → Create from scratch / Import from file`.
- `/skills/[id]` — left rail + editor with tabs **Config / Preview / Versions**,
  tab state in `?tab=`.
- `/agents/[id]?tab=skills` — attach/detach, enable/disable, reorder.

## Acceptance criteria

- [x] `pnpm db:migrate` applies `0011` cleanly against a fresh database.
- [x] Skills CRUD is workspace-scoped; a skill from another workspace 404s.
- [x] Saving a changed body bumps `skills.version` and appends a
      `skill_versions` row; a name/description/type-only save does not.
- [x] Saving a type name that does not exist yet inserts it into `skill_types`,
      and it appears in the dropdown on the next load.
- [x] `POST /skills/:id/versions/:version/restore` sets the body and version to
      that snapshot and deletes every strictly newer `skill_versions` row.
- [x] `POST /skills/import/preview` returns a parsed preview and persists
      nothing; the skill exists only after the client confirms.
- [x] Linking a skill id from another workspace is rejected with a 422 (it was
      silently accepted before — the FK only proves existence, not ownership).
- [x] An agent's enabled, attached skills reach `PromptAssembly.skills` in
      `order`; a disabled link and a globally disabled skill are both excluded.
- [x] An agent with no attached skills produces a byte-identical prompt to
      before this change.

## Test plan

Per [../../TESTING.md](../../TESTING.md). Anything importing `test/helpers/pg.ts`
must be named `*.it.test.ts` — CI splits on the filename.

- `test/skills-helpers.test.ts` (unit, no Docker) — markdown import parsing
  (heading vs filename fallback, description extraction), DTO mappers, the
  body-changed version-bump predicate.
- `test/skills.it.test.ts` (integration) — CRUD, version history ordering,
  restore truncating newer versions, type upsert on save, cross-tenant 404s.
  Modelled on `test/agents-versions.it.test.ts`.
- `test/skills-prompt.it.test.ts` (integration) — ordered enabled bodies reach
  `PromptAssembly.skills`; disabled link and disabled skill excluded; no links
  leaves the prompt unchanged.

Client coverage lives in [../../client/specs/L02-skills.md](../../client/specs/L02-skills.md).
