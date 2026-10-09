import type {
  AgentContext,
  ContextPaths,
  ContextSources,
  ProjectContextEntry,
  RepoRef,
  SpecFile,
} from '@devdigest/shared';
import { estimateTokens, renderProjectContextBlock, type ProjectDoc } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_CONTEXT_DOC_BYTES, READ_CONCURRENCY } from './constants.js';
import {
  classifyRead,
  isDocPath,
  normalizeItems,
  runOrder,
  sortForResponse,
  sourceOf,
  toSpecFile,
} from './helpers.js';
import { ContextDocsRepository } from './repository.js';
import type { ContextItemRow, ProjectContextFacade } from './types.js';

/**
 * L05 — Project Context (ring ②).
 *
 *   LIST     every `.md` under a configured folder at the clone's HEAD (git
 *            objects, never the working tree), with its size and token count.
 *            Cached per `(repoId, HEAD sha)`: a resync moves HEAD, so the next
 *            call misses. This instance is built once per app (routes.ts).
 *   ATTACH   per-agent and per-skill path lists — paths only, no doc text, no
 *            versioning (`agents.update` / `skills.update` are never called).
 *   RUN      `resolveForRun` — the docs a run adds to its prompt, in A-5 order.
 *
 * Makes no LLM and no GitHub call.
 */
export class ContextService implements ProjectContextFacade {
  private repo: ContextDocsRepository;
  private cache = new Map<string, { head: string; docs: SpecFile[] }>();

  constructor(private container: Container) {
    this.repo = new ContextDocsRepository(container.db);
  }

  private get folders(): string[] {
    return this.container.config.contextFolders;
  }

  sources(): ContextSources {
    return { folders: [...this.folders] };
  }

  // ---- the doc list -------------------------------------------------------

  async listDocs(workspaceId: string, repoId: string): Promise<SpecFile[]> {
    const { docs } = await this.cachedList(workspaceId, repoId);
    return docs.map((d) => ({ ...d }));
  }

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const { head, docs, ref } = await this.cachedList(workspaceId, repoId);
    // Membership first: nothing outside the list is ever read.
    const entry = docs.find((d) => d.path === path);
    if (!entry) throw new NotFoundError('Document not found');

    let content: string | null = null;
    let tokens: number | null = null;
    if (entry.tokens != null) {
      const read = await this.container.git
        .readFileAtRef(ref, head, path, MAX_CONTEXT_DOC_BYTES)
        .catch(() => null);
      if (read && classifyRead(read, MAX_CONTEXT_DOC_BYTES) === 'ok') {
        content = read.text;
        tokens = estimateTokens(read.text);
      }
    }
    const usedBy = await this.repo.countAgentsUsing(workspaceId, path);
    return toSpecFile({
      path,
      source: entry.source ?? null,
      size: entry.size ?? null,
      tokens,
      content,
      usedBy,
    });
  }

  private async cachedList(
    workspaceId: string,
    repoId: string,
  ): Promise<{ head: string; docs: SpecFile[]; ref: RepoRef }> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    if (!repo.clonePath) throw new ValidationError('This repository has not been cloned yet.');
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const git = this.container.git;
    const head = await git.currentHead(ref);

    const hit = this.cache.get(repoId);
    if (hit && hit.head === head) return { head, docs: hit.docs, ref };

    const folders = this.folders;
    const paths = (await git.listFiles(ref, head)).filter((p) => isDocPath(p, folders)).sort();
    const docs: SpecFile[] = [];
    for (let i = 0; i < paths.length; i += READ_CONCURRENCY) {
      const batch = paths.slice(i, i + READ_CONCURRENCY);
      docs.push(
        ...(await Promise.all(
          batch.map(async (path) => {
            const read = await git
              .readFileAtRef(ref, head, path, MAX_CONTEXT_DOC_BYTES)
              .catch(() => null);
            const ok = read !== null && classifyRead(read, MAX_CONTEXT_DOC_BYTES) === 'ok';
            return toSpecFile({
              path,
              source: sourceOf(path, folders),
              size: read?.bytes ?? null,
              tokens: ok ? estimateTokens(read.text) : null,
            });
          }),
        )),
      );
    }
    this.cache.set(repoId, { head, docs });
    return { head, docs, ref };
  }

  // ---- attachments --------------------------------------------------------

  async getAgentContext(workspaceId: string, agentId: string): Promise<AgentContext> {
    await this.requireAgent(workspaceId, agentId);
    return this.agentContext(workspaceId, agentId);
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    items: ContextItemRow[],
  ): Promise<AgentContext> {
    await this.requireAgent(workspaceId, agentId);
    await this.repo.replaceAgentItems(agentId, this.normalized(items));
    return this.agentContext(workspaceId, agentId);
  }

  async getSkillContext(workspaceId: string, skillId: string): Promise<ContextPaths> {
    await this.requireSkill(workspaceId, skillId);
    return { items: sortForResponse(await this.repo.itemsForSkill(skillId)) };
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    items: ContextItemRow[],
  ): Promise<ContextPaths> {
    await this.requireSkill(workspaceId, skillId);
    await this.repo.replaceSkillItems(skillId, this.normalized(items));
    return { items: sortForResponse(await this.repo.itemsForSkill(skillId)) };
  }

  private normalized(items: ContextItemRow[]): ContextItemRow[] {
    const n = normalizeItems(items);
    if ('error' in n) throw new ValidationError('Two documents share one position.');
    return n.items;
  }

  private async agentContext(workspaceId: string, agentId: string): Promise<AgentContext> {
    const [own, inherited] = await Promise.all([
      this.repo.itemsForAgent(agentId),
      this.repo.inheritedForAgent(workspaceId, agentId),
    ]);
    return {
      items: sortForResponse(own),
      inherited: inherited.map((s) => ({
        skill_id: s.skillId,
        skill_name: s.skillName,
        items: sortForResponse(s.items),
      })),
    };
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<void> {
    if (!(await this.container.agentsRepo.getById(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
  }

  private async requireSkill(workspaceId: string, skillId: string): Promise<void> {
    if (!(await this.container.skillsRepo.getById(workspaceId, skillId))) {
      throw new NotFoundError('Skill not found');
    }
  }

  // ---- the run ------------------------------------------------------------

  async resolveForRun(a: {
    workspaceId: string;
    agentId: string;
    repo: RepoRef;
    cloned: boolean;
  }): Promise<{ docs: ProjectDoc[]; entries: ProjectContextEntry[] }> {
    try {
      const [own, inherited] = await Promise.all([
        this.repo.itemsForAgent(a.agentId),
        this.repo.inheritedForAgent(a.workspaceId, a.agentId),
      ]);
      const folders = this.folders;

      // A-5: the agent's own docs first, then each inherited skill's; a path seen once is not repeated.
      const seen = new Set<string>();
      const ordered: { path: string; via: { id: string; name: string } | null }[] = [];
      const take = (items: ContextItemRow[], via: { id: string; name: string } | null) => {
        for (const it of runOrder(items, folders)) {
          if (seen.has(it.path)) continue;
          seen.add(it.path);
          ordered.push({ path: it.path, via });
        }
      };
      take(own, null);
      for (const s of inherited) take(s.items, { id: s.skillId, name: s.skillName });
      if (ordered.length === 0) return { docs: [], entries: [] };

      let head: string | null = null;
      if (a.cloned) {
        try {
          head = await this.container.git.currentHead(a.repo);
        } catch {
          head = null;
        }
      }

      const docs: ProjectDoc[] = [];
      const entries: ProjectContextEntry[] = [];
      for (const o of ordered) {
        const skip = (reason: 'not_found' | 'too_large' | 'unreadable'): void => {
          entries.push({
            path: o.path,
            tokens: 0,
            status: 'skipped',
            reason,
            via_skill: o.via,
            text: null,
          });
        };
        if (head === null) {
          skip('not_found');
          continue;
        }
        let read: { text: string; bytes: number } | null;
        try {
          read = await this.container.git.readFileAtRef(a.repo, head, o.path, MAX_CONTEXT_DOC_BYTES);
        } catch {
          skip('unreadable');
          continue;
        }
        const cls = classifyRead(read, MAX_CONTEXT_DOC_BYTES);
        if (cls !== 'ok' || read === null) {
          skip(cls === 'ok' ? 'unreadable' : cls);
          continue;
        }
        const doc: ProjectDoc = { source: o.path, text: read.text };
        docs.push(doc);
        entries.push({
          path: o.path,
          tokens: estimateTokens(read.text),
          status: 'included',
          via_skill: o.via,
          text: renderProjectContextBlock(doc),
        });
      }
      return { docs, entries };
    } catch {
      return { docs: [], entries: [] };
    }
  }
}
