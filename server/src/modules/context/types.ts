import type { ProjectContextEntry, RepoRef } from '@devdigest/shared';
import type { ProjectDoc } from '@devdigest/reviewer-core';

/**
 * L05 — project-context module types (ring ②). `ProjectContextFacade` is the one
 * thing other modules see: the review executor reaches it through
 * `container.projectContext`, never by importing this folder.
 */
export interface ProjectContextFacade {
  /**
   * The docs attached to an agent (and, through its skills, inherited), read from
   * the clone's HEAD. NEVER throws — a doc that cannot be read becomes a
   * `skipped` entry. Reads the attachment lists once (A-11).
   * `docs` = the included docs, in prompt order.
   */
  resolveForRun(a: {
    workspaceId: string;
    agentId: string;
    repo: RepoRef;
    cloned: boolean;
  }): Promise<{ docs: ProjectDoc[]; entries: ProjectContextEntry[] }>;
}

/** A stored attachment: a repo-relative path and its manual position (null = none). */
export interface ContextItemRow {
  path: string;
  position: number | null;
}

/** The outcome of reading one blob (see `classifyRead`). */
export type ReadClass = 'ok' | 'not_found' | 'too_large' | 'unreadable';
