/**
 * Use case (ring ②) — the resolver. Turns a human-written or UUID reference
 * (`pr`, `repo`, `agent`) into a DevDigest id, over the `DevDigestApi` port
 * only, with a per-process cache. Never calls `startReview` — the port has
 * no such method reachable from here without also holding a `DevDigestApi`,
 * and nothing in this file does. Must not import the SDK, `fetch`, the
 * environment, `api/`, `tools/`, `server.ts`, `index.ts`, `config.ts` or
 * `log.ts`.
 */
import type { AgentWire, PullListItemWire, RepoWire } from './contracts.js';
import {
  agentIdNotFound,
  agentNameAmbiguous,
  agentNameNotFound,
  NotFoundError,
  prIdNotFound,
  prNotSynced,
  repoNotFound,
  unreadablePr,
  unreadableRepo,
} from './errors.js';
import type { CallOpts, DevDigestApi } from './ports.js';
import { UUID_RE } from './constants.js';

export interface PrRef {
  id: string;
  label: string;
  title: string | null;
  number: number;
  repoFullName: string | null;
  repoId: string | null;
}

export interface RepoRef {
  id: string;
  fullName: string;
}

export interface AgentRef {
  id: string;
  name: string;
}

const PR_REF_RE = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const PR_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/;
const REPO_REF_RE = /^([\w.-]+)\/([\w.-]+)$/;

export class Resolver {
  private reposCache: RepoWire[] | null = null;
  private readonly pullsCache = new Map<string, PullListItemWire[]>();
  private agentsCache: AgentWire[] | null = null;
  private readonly prByRefCache = new Map<string, PrRef>();
  private readonly prByIdCache = new Map<string, PrRef>();

  constructor(private readonly api: DevDigestApi) {}

  private async getRepos(signal?: AbortSignal, opts: { refresh?: boolean } = {}): Promise<RepoWire[]> {
    if (!opts.refresh && this.reposCache) return this.reposCache;
    const repos = await this.api.listRepos(this.opts(signal));
    this.reposCache = repos;
    return repos;
  }

  private async findRepoByFullName(fullName: string, signal?: AbortSignal): Promise<RepoWire> {
    let repos = await this.getRepos(signal);
    let found = repos.find((r) => r.full_name.toLowerCase() === fullName.toLowerCase());
    if (!found) {
      repos = await this.getRepos(signal, { refresh: true });
      found = repos.find((r) => r.full_name.toLowerCase() === fullName.toLowerCase());
    }
    if (!found) throw repoNotFound(fullName, repos.map((r) => r.full_name));
    return found;
  }

  private async getPulls(
    repo: RepoWire,
    signal?: AbortSignal,
    opts: { refresh?: boolean } = {},
  ): Promise<PullListItemWire[]> {
    if (!opts.refresh) {
      const cached = this.pullsCache.get(repo.id);
      if (cached) return cached;
    }
    const pulls = await this.api.listPulls(repo.id, this.opts(signal));
    this.pullsCache.set(repo.id, pulls);
    return pulls;
  }

  private opts(signal?: AbortSignal): CallOpts | undefined {
    return signal ? { signal } : undefined;
  }

  /** Resolves `owner/repo#N`, a GitHub PR URL, or a DevDigest PR UUID. */
  async pr(input: string, signal?: AbortSignal): Promise<PrRef> {
    if (UUID_RE.test(input)) return this.prByUuid(input, signal);

    const m = input.match(PR_REF_RE) ?? input.match(PR_URL_RE);
    if (!m) throw unreadablePr(input);
    const [, owner, name, numberStr] = m as unknown as [string, string, string, string];
    return this.prByRef(`${owner}/${name}`, Number(numberStr), signal);
  }

  private async prByRef(fullNameInput: string, number: number, signal?: AbortSignal): Promise<PrRef> {
    const cacheKey = `${fullNameInput.toLowerCase()}#${number}`;
    const cached = this.prByRefCache.get(cacheKey);
    if (cached) return cached;

    const repo = await this.findRepoByFullName(fullNameInput, signal);
    let pulls = await this.getPulls(repo, signal);
    let found = pulls.find((p) => p.number === number);
    if (!found) {
      pulls = await this.getPulls(repo, signal, { refresh: true });
      found = pulls.find((p) => p.number === number);
    }
    if (!found || found.id == null) {
      throw prNotSynced(`${repo.full_name}#${number}`, repo.full_name);
    }

    const ref: PrRef = {
      id: found.id,
      label: `${repo.full_name}#${number}`,
      title: found.title,
      number,
      repoFullName: repo.full_name,
      repoId: repo.id,
    };
    this.prByRefCache.set(cacheKey, ref);
    this.prByIdCache.set(ref.id, ref);
    return ref;
  }

  private async prByUuid(id: string, signal?: AbortSignal): Promise<PrRef> {
    const cached = this.prByIdCache.get(id);
    if (cached) return cached;

    let detail;
    try {
      detail = await this.api.getPull(id, this.opts(signal));
    } catch (err) {
      if (err instanceof NotFoundError) throw prIdNotFound(id);
      throw err;
    }
    const ref: PrRef = {
      id,
      label: `#${detail.number}`,
      title: detail.title,
      number: detail.number,
      repoFullName: null,
      repoId: null,
    };
    this.prByIdCache.set(id, ref);
    return ref;
  }

  /** Resolves `owner/repo` (case-insensitive) or a DevDigest repo UUID. */
  async repo(input: string, signal?: AbortSignal): Promise<RepoRef> {
    if (UUID_RE.test(input)) {
      let repos = await this.getRepos(signal);
      let found = repos.find((r) => r.id === input);
      if (!found) {
        repos = await this.getRepos(signal, { refresh: true });
        found = repos.find((r) => r.id === input);
      }
      if (!found) throw repoNotFound(input, repos.map((r) => r.full_name));
      return { id: found.id, fullName: found.full_name };
    }
    const m = input.match(REPO_REF_RE);
    if (!m) throw unreadableRepo(input);
    const repo = await this.findRepoByFullName(`${m[1]}/${m[2]}`, signal);
    return { id: repo.id, fullName: repo.full_name };
  }

  /** Fetches (or reuses) the agents list. `list_agents` always passes
   * `refresh: true` so a newly created agent is visible in the same session;
   * everything else reuses the cache and refetches once on a miss. */
  async agents(signal?: AbortSignal, opts: { refresh?: boolean } = {}): Promise<AgentWire[]> {
    if (!opts.refresh && this.agentsCache) return this.agentsCache;
    const agents = await this.api.listAgents(this.opts(signal));
    this.agentsCache = agents;
    return agents;
  }

  /** Resolves a DevDigest agent UUID, or a trimmed case-insensitive exact name. */
  async agent(input: string, signal?: AbortSignal): Promise<AgentRef> {
    let agents = await this.agents(signal);

    if (UUID_RE.test(input)) {
      let found = agents.find((a) => a.id === input);
      if (!found) {
        agents = await this.agents(signal, { refresh: true });
        found = agents.find((a) => a.id === input);
      }
      if (!found) throw agentIdNotFound(input);
      return { id: found.id, name: found.name };
    }

    const needle = input.trim().toLowerCase();
    let matches = agents.filter((a) => a.name.trim().toLowerCase() === needle);
    if (matches.length === 0) {
      agents = await this.agents(signal, { refresh: true });
      matches = agents.filter((a) => a.name.trim().toLowerCase() === needle);
    }
    if (matches.length === 0) throw agentNameNotFound(input, agents.map((a) => a.name));
    if (matches.length > 1) {
      throw agentNameAmbiguous(input, matches.map((a) => ({ name: a.name, id: a.id })));
    }
    const only = matches[0];
    if (!only) throw agentNameNotFound(input, agents.map((a) => a.name));
    return { id: only.id, name: only.name };
  }
}
