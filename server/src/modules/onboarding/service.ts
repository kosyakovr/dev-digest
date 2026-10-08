import type { Onboarding, OnboardingSection, OnboardingTourState, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ConfigError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import type { ChildableLogger } from '../../platform/prompt-log.js';
import type { RepoRow } from '../../db/rows.js';
import {
  MANIFEST_MAX_BYTES,
  TOUR_IN_PROGRESS_CODE,
  TOUR_IN_PROGRESS_MESSAGE,
  TOUR_KEPT_MESSAGE,
} from './constants.js';
import {
  buildSkeleton,
  mergeModelAnswer,
  parseStoredTour,
  promptFactsOf,
  stripNul,
  toTourState,
} from './helpers.js';
import { callTourModel } from './model-call.js';
import { buildTourMessages } from './prompt.js';
import { OnboardingRepository } from './repository.js';
import { manifestPaths } from './run-steps.js';

/**
 * L05 onboarding tour use case (ring ②). No HTTP and no SQL.
 *
 *   GET      the stored tour + `generating` / `stale`; never calls a model.
 *   GENERATE skeleton from the repo index and the clone's manifests at HEAD,
 *            then ONE structured model call whose prose is merged onto the
 *            skeleton (anything ungrounded is dropped), stored in `onboarding`.
 *
 * One generation per repo at a time (in-process guard, lost on restart — A-15).
 * This instance is built once per app (routes.ts), so the guard is shared.
 */
export class OnboardingTourService {
  private repo: OnboardingRepository;
  private running = new Set<string>();

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  async getState(
    workspaceId: string,
    repoId: string,
    logger?: ChildableLogger,
  ): Promise<OnboardingTourState> {
    await this.requireRepo(workspaceId, repoId);
    const row = await this.repo.findForRepo(workspaceId, repoId);
    const tour = row ? parseStoredTour(row.json) : null;
    if (row && !tour) logger?.warn({ repoId }, 'onboarding: stored tour unreadable');
    const state = await this.container.repoIntel.getIndexState(repoId);
    return toTourState(tour, state.lastIndexedSha || null, this.running.has(repoId));
  }

  async generate(
    workspaceId: string,
    repoId: string,
    logger?: ChildableLogger,
  ): Promise<OnboardingTourState> {
    const started = Date.now();
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('This repository has not been cloned yet.');
    if (this.running.has(repoId)) {
      throw new AppError(TOUR_IN_PROGRESS_CODE, TOUR_IN_PROGRESS_MESSAGE, 409);
    }
    this.running.add(repoId);
    try {
      return await this.run(workspaceId, repo, started, logger);
    } finally {
      this.running.delete(repoId);
    }
  }

  // ---- internals ---------------------------------------------------------

  private async run(
    workspaceId: string,
    repo: RepoRow,
    started: number,
    logger?: ChildableLogger,
  ): Promise<OnboardingTourState> {
    const repoId = repo.id;
    const prior = await this.repo.findForRepo(workspaceId, repoId);
    const priorIsLlm = (prior ? parseStoredTour(prior.json) : null)?.source === 'llm';

    const facts = await this.container.repoIntel.getOnboardingFacts(repoId);
    const clone = await this.readClone(repo);
    const skeleton = buildSkeleton(facts, clone);

    let sections: OnboardingSection[] = skeleton;
    let source: Onboarding['source'] = 'skeleton';
    let skeletonReason: Onboarding['skeleton_reason'];
    let model: string | null = null;
    let costUsd: number | null = null;
    let dropped = 0;

    if (!facts.usable) {
      skeletonReason = 'index_unavailable';
    } else {
      const outcome = await this.askModel(workspaceId, repo, facts, clone, skeleton);
      if (outcome.kind === 'ok') {
        const merged = mergeModelAnswer(
          skeleton,
          outcome.answer,
          new Set(facts.files.map((f) => f.path)),
        );
        sections = merged.sections;
        dropped = merged.dropped;
        source = 'llm';
        model = outcome.model;
        costUsd = outcome.costUsd;
      } else {
        const reason = outcome.kind === 'unavailable' ? 'llm_unavailable' : `llm_${outcome.kind}`;
        skeletonReason = reason as Onboarding['skeleton_reason'];
        if (priorIsLlm) {
          logger?.warn(
            { repoId, skeleton_reason: skeletonReason },
            'onboarding: model call failed, previous tour kept',
          );
          throw new ExternalServiceError(TOUR_KEPT_MESSAGE);
        }
      }
    }

    const generatedAt = new Date();
    const doc: Onboarding = stripNul({
      sections,
      source,
      ...(skeletonReason ? { skeleton_reason: skeletonReason } : {}),
      index_status: facts.status,
      ...(facts.reason ? { index_reason: facts.reason } : {}),
      indexed_sha: facts.indexedSha,
      files_indexed: facts.filesIndexed,
      generated_at: generatedAt.toISOString(),
      ...(source === 'llm' ? { model, cost_usd: costUsd } : {}),
    });
    await this.repo.save(repoId, doc, generatedAt);

    logger?.info(
      {
        repoId,
        source,
        skeleton_reason: skeletonReason,
        index_status: facts.status,
        indexedSha: facts.indexedSha,
        model,
        costUsd,
        droppedItems: dropped,
        ms: Date.now() - started,
      },
      'onboarding: generated',
    );
    return toTourState(doc, facts.indexedSha || null, false);
  }

  private async askModel(
    workspaceId: string,
    repo: RepoRow,
    facts: Awaited<ReturnType<Container['repoIntel']['getOnboardingFacts']>>,
    clone: { tree: string[]; manifests: Record<string, string>; readme: string },
    skeleton: OnboardingSection[],
) {
    const choice = await this.container.resolveFeatureModel(workspaceId, 'onboarding');
    let llm;
    try {
      llm = await this.container.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) return { kind: 'unavailable' as const };
      throw err;
    }
    const messages = buildTourMessages({
      fullName: repo.fullName,
      readme: clone.readme,
      ...promptFactsOf(facts, clone, skeleton),
    });
    return callTourModel(llm, { model: choice.model, messages });
  }

  /** Manifests and README at the clone's HEAD (git objects). Any failure → nothing. */
  private async readClone(repo: RepoRow) {
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const empty = { tree: [] as string[], manifests: {} as Record<string, string>, readme: '' };
    try {
      const git = this.container.git;
      const head = await git.currentHead(ref);
      const tree = await git.listFiles(ref, head);
      const read = async (path: string): Promise<string | null> => {
        const r = await git.readFileAtRef(ref, head, path, MANIFEST_MAX_BYTES).catch(() => null);
        return r && r.bytes <= MANIFEST_MAX_BYTES ? r.text : null;
      };
      const manifests: Record<string, string> = {};
      for (const path of manifestPaths(tree)) {
        const text = await read(path);
        if (text !== null) manifests[path] = text;
      }
      const readme = tree.includes('README.md') ? ((await read('README.md')) ?? '') : '';
      return { tree, manifests, readme };
    } catch {
      return empty;
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
