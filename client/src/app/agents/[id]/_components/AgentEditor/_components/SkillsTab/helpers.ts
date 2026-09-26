import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Pure helpers for the agent editor's Skills tab. No I/O, no React. */

/** A skill plus its state for THIS agent. Unattached skills appear too. */
export interface SkillRow {
  skill: Skill;
  /** In this agent's set at all. */
  attached: boolean;
  /** The link's own toggle. Meaningless while `attached` is false. */
  enabled: boolean;
}

/**
 * Build the editable row list: attached skills first, in link order, then the
 * rest alphabetically. Order matters — the attached prefix IS the prompt order,
 * so it must never be re-sorted by name.
 */
export function buildRows(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const ordered = [...links].sort((a, b) => a.order - b.order);

  const attached: SkillRow[] = [];
  for (const l of ordered) {
    const skill = byId.get(l.skill_id);
    // A link can outlive its skill in a stale cache; skip rather than crash.
    if (skill) attached.push({ skill, attached: true, enabled: l.enabled });
  }

  const attachedIds = new Set(attached.map((r) => r.skill.id));
  const rest = skills
    .filter((s) => !attachedIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, attached: false, enabled: true }));

  return [...attached, ...rest];
}

/** Rows currently in the agent's set, in order. */
export function attachedRows(rows: SkillRow[]): SkillRow[] {
  return rows.filter((r) => r.attached);
}

/** How many attached links are enabled — the "N of M enabled" counter. */
export function countEnabled(rows: SkillRow[]): number {
  return rows.filter((r) => r.attached && r.enabled).length;
}

/**
 * Attach or detach a skill. Detaching drops it out of the ordered prefix;
 * attaching appends it to the END, so an existing order is never disturbed.
 */
export function toggleAttached(rows: SkillRow[], skillId: string): SkillRow[] {
  const row = rows.find((r) => r.skill.id === skillId);
  if (!row) return rows;

  const rest = rows.filter((r) => r.skill.id !== skillId);
  const updated: SkillRow = { ...row, attached: !row.attached, enabled: true };
  if (!updated.attached) return normalize([...rest, updated]);

  const attached = rest.filter((r) => r.attached);
  const detached = rest.filter((r) => !r.attached);
  return [...attached, updated, ...detached];
}

/** Flip the per-link toggle. A detached row has no link to toggle. */
export function toggleEnabled(rows: SkillRow[], skillId: string): SkillRow[] {
  return rows.map((r) =>
    r.skill.id === skillId && r.attached ? { ...r, enabled: !r.enabled } : r,
  );
}

/**
 * Move an attached row by `delta` within the attached prefix. Clamped, so the
 * first row cannot move up out of the list and the last cannot move down into
 * the unattached section.
 */
export function moveRow(rows: SkillRow[], skillId: string, delta: number): SkillRow[] {
  const attached = rows.filter((r) => r.attached);
  const detached = rows.filter((r) => !r.attached);
  const from = attached.findIndex((r) => r.skill.id === skillId);
  if (from === -1) return rows;

  const to = from + delta;
  if (to < 0 || to >= attached.length) return rows;

  const next = [...attached];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return [...next, ...detached];
}

/** Move an attached row to an absolute index within the attached prefix (drag-drop). */
export function reorderTo(rows: SkillRow[], skillId: string, toIndex: number): SkillRow[] {
  const from = rows.filter((r) => r.attached).findIndex((r) => r.skill.id === skillId);
  if (from === -1) return rows;
  return moveRow(rows, skillId, toIndex - from);
}

/** The payload for POST /agents/:id/skills — array order is prompt order. */
export function toPayload(rows: SkillRow[]): { skill_id: string; enabled: boolean }[] {
  return attachedRows(rows).map((r) => ({ skill_id: r.skill.id, enabled: r.enabled }));
}

/** Keep the invariant that attached rows form the prefix of the list. */
function normalize(rows: SkillRow[]): SkillRow[] {
  return [...rows.filter((r) => r.attached), ...rows.filter((r) => !r.attached)];
}
