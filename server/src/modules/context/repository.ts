import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ContextItemRow } from './types.js';

/**
 * L05 — project-context data access (ring ③). The ONLY place that touches
 * `agent_context_docs` / `skill_context_docs`. Stores repo-relative paths and a
 * position only — never doc text. Callers check workspace ownership of the
 * agent or skill (through `container.agentsRepo` / `skillsRepo`) before any call.
 */

/** A skill an agent inherits docs from, with its attached items. */
export interface InheritedSkillRow {
  skillId: string;
  skillName: string;
  items: ContextItemRow[];
}

export class ContextDocsRepository {
  constructor(private db: Db) {}

  async itemsForAgent(agentId: string): Promise<ContextItemRow[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path, position: t.agentContextDocs.position })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    return rows.map((r) => ({ path: r.path, position: r.position }));
  }

  async itemsForSkill(skillId: string): Promise<ContextItemRow[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path, position: t.skillContextDocs.position })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId));
    return rows.map((r) => ({ path: r.path, position: r.position }));
  }

  /** Replace the agent's whole set: delete then insert in ONE transaction. */
  async replaceAgentItems(agentId: string, items: ContextItemRow[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Serialize writers to one owner: lock the parent row first (last write wins).
      await tx.select({ id: t.agents.id }).from(t.agents).where(eq(t.agents.id, agentId)).for('update');
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (items.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(items.map((i) => ({ agentId, path: i.path, position: i.position })));
    });
  }

  /** Replace the skill's whole set: delete then insert in ONE transaction. */
  async replaceSkillItems(skillId: string, items: ContextItemRow[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Serialize writers to one owner: lock the parent row first (last write wins).
      await tx.select({ id: t.skills.id }).from(t.skills).where(eq(t.skills.id, skillId)).for('update');
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (items.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(items.map((i) => ({ skillId, path: i.path, position: i.position })));
    });
  }

  /**
   * Skills whose link to the agent is enabled and that are enabled globally,
   * with at least one attached doc, in `agent_skills.order`. The agent's skills
   * must belong to `workspaceId` (a FK proves existence, not tenancy).
   */
  async inheritedForAgent(workspaceId: string, agentId: string): Promise<InheritedSkillRow[]> {
    const links = await this.db
      .select({ skillId: t.skills.id, skillName: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    if (links.length === 0) return [];
    const docs = await this.db
      .select({
        skillId: t.skillContextDocs.skillId,
        path: t.skillContextDocs.path,
        position: t.skillContextDocs.position,
      })
      .from(t.skillContextDocs)
      .where(
        inArray(
          t.skillContextDocs.skillId,
          links.map((l) => l.skillId),
        ),
      );
    return links
      .map((l) => ({
        skillId: l.skillId,
        skillName: l.skillName,
        items: docs
          .filter((d) => d.skillId === l.skillId)
          .map((d) => ({ path: d.path, position: d.position })),
      }))
      .filter((l) => l.items.length > 0);
  }

  /**
   * Agents of the workspace that attach `path` directly, or through a skill that
   * is enabled on the agent and enabled globally (R-35). Whatever `agents.enabled` is.
   */
  async countAgentsUsing(workspaceId: string, path: string): Promise<number> {
    const direct = await this.db
      .select({ id: t.agents.id })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentContextDocs.path, path)));
    const viaSkill = await this.db
      .select({ id: t.agents.id })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.skillContextDocs.path, path),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.agents.workspaceId, workspaceId),
        ),
      );
    return new Set([...direct, ...viaSkill].map((r) => r.id)).size;
  }
}
