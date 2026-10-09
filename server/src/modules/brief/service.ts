import type { PrBrief, PrBriefResponse, PrIntentRecord } from '@devdigest/shared';
import type { ProjectDoc } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ConfigError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { logPrompt, type ChildableLogger } from '../../platform/prompt-log.js';
// GT-1 (approved by the user 2026-10-09): the one sideways import — a pure function.
import { classifyFile } from '../reviews/smart-diff/helpers.js';
import {
  BRIEF_FAILED_PREFIX,
  BRIEF_IN_PROGRESS_CODE,
  BRIEF_IN_PROGRESS_MESSAGE,
  BRIEF_EMPTY_SUMMARY_MESSAGE,
  BRIEF_TIMEOUT_MESSAGE,
  NO_FILES_MESSAGE,
  PULL_NOT_FOUND_MESSAGE,
  REPO_NOT_FOUND_MESSAGE,
} from './constants.js';
import {
  buildBriefFacts,
  clampAnswer,
  groundFocus,
  groundRisks,
  parseStoredBrief,
  toBriefResponse,
  toIntent,
  type BriefFile,
} from './helpers.js';
import { callBriefModel } from './model-call.js';
import { briefPromptSections, buildBriefMessages, SYSTEM_PROMPT } from './prompt.js';
import { BriefRepository } from './repository.js';

/**
 * L05 risk brief use case (ring ②). No HTTP and no SQL.
 *
 *   GET      the stored brief + `generating` / `stale`; never calls a model.
 *   GENERATE intent (stored or derived) + blast + history + project docs →
 *            ONE structured model call → every file and line checked against
 *            the PR's diff → stored in `pr_brief`.
 *
 * One generation per PR at a time (in-process guard, lost on restart). This
 * instance is built once per app (routes.ts), so the guard is shared. Other
 * modules are reached only through `container.*`.
 */
export class BriefService {
  private repo: BriefRepository;
  private running = new Set<string>();

  /** `deadlineMs` exists for tests; the route uses the 120 s default (NFR-1). */
  constructor(
    private container: Container,
    private opts: { deadlineMs?: number } = {},
  ) {
    this.repo = new BriefRepository(container.db);
  }

  async getState(
    workspaceId: string,
    prId: string,
    logger?: ChildableLogger,
  ): Promise<PrBriefResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.repo.findForPull(workspaceId, prId);
    const brief = row ? parseStoredBrief(row.json) : null;
    if (row && !brief) logger?.warn({ prId }, 'brief: unreadable');
    return toBriefResponse(brief, pull.headSha, this.running.has(prId));
  }

  async generate(
    workspaceId: string,
    prId: string,
    logger?: ChildableLogger,
  ): Promise<PrBriefResponse> {
    const started = Date.now();
    const pull = await this.requirePull(workspaceId, prId);
    if (this.running.has(prId)) {
      throw new AppError(BRIEF_IN_PROGRESS_CODE, BRIEF_IN_PROGRESS_MESSAGE, 409);
    }
    this.running.add(prId);
    try {
      return await this.run(workspaceId, pull.id, pull.headSha, pull.repoId, started, logger);
    } catch (err) {
      logger?.warn(
        {
          prId,
          code: err instanceof AppError ? err.code : 'internal_error',
          status: err instanceof AppError ? err.statusCode : 500,
          reason: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - started,
        },
        'brief: failed',
      );
      throw err;
    } finally {
      this.running.delete(prId);
    }
  }

  // ---- internals ---------------------------------------------------------

  private async run(
    workspaceId: string,
    prId: string,
    headSha: string,
    repoId: string,
    started: number,
    logger?: ChildableLogger,
  ): Promise<PrBriefResponse> {
    const { container } = this;
    const prFiles = await container.reviewRepo.getPrFiles(prId);
    if (prFiles.length === 0) throw new ValidationError(NO_FILES_MESSAGE);

    // The key check comes before any model or GitHub work (AC-15).
    const choice = await container.resolveFeatureModel(workspaceId, 'risk_brief');
    let llm;
    try {
      llm = await container.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) throw new ValidationError(err.message, err.details);
      throw err;
    }

    const intent = await this.resolveIntent(workspaceId, prId, logger);
    const blast = await container.prBlast.getBlast(workspaceId, prId, logger);
    const history = await container.prBlast.getHistory(workspaceId, prId, logger);

    const repo = await container.reviewRepo.getRepo(repoId);
    if (!repo) throw new NotFoundError(REPO_NOT_FOUND_MESSAGE);
    const docs = await this.collectDocs(workspaceId, repo);

    const files: BriefFile[] = prFiles.map((f) => ({
      path: f.path,
      role: classifyFile(f.path),
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
    const { payload, specsRead } = buildBriefFacts({
      intent: toIntent(intent),
      files,
      blast,
      history,
      docs,
    });
    const messages = buildBriefMessages(payload);

    // Metadata only (lengths, sections); the prompt text itself is never logged.
    logPrompt(
      logger,
      {
        kind: 'brief',
        provider: choice.provider,
        model: choice.model,
        sections: briefPromptSections(payload),
        totalChars: messages.reduce((n, m) => n + m.content.length, 0),
        systemPrompt: SYSTEM_PROMPT,
      },
      container.config.promptLog,
    );

    const outcome = await callBriefModel(
      llm,
      { model: choice.model, messages },
      this.opts.deadlineMs,
    );
    if (outcome.kind === 'failed') {
      throw new ExternalServiceError(`${BRIEF_FAILED_PREFIX}${outcome.reason}`);
    }
    if (outcome.kind === 'timeout') throw new ExternalServiceError(BRIEF_TIMEOUT_MESSAGE);

    const focus = groundFocus(outcome.answer.review_focus, files);
    const risks = groundRisks(
      outcome.answer.risks,
      files.map((f) => f.path),
    );
    const clamped = clampAnswer({
      summary: outcome.answer.summary,
      risks: risks.kept,
      review_focus: focus.kept,
    });
    if (clamped.emptySummary) throw new ExternalServiceError(BRIEF_EMPTY_SUMMARY_MESSAGE);

    const brief: PrBrief = {
      intent: toIntent(intent),
      blast,
      risks: { risks: clamped.risks },
      history,
      summary: clamped.summary,
      review_focus: clamped.review_focus,
      generation: {
        head_sha: headSha,
        generated_at: new Date().toISOString(),
        provider: choice.provider,
        model: outcome.model,
        tokens_in: outcome.tokensIn,
        tokens_out: outcome.tokensOut,
        cost_usd: outcome.costUsd,
        specs_read: specsRead,
      },
    };
    await this.repo.save(prId, brief);

    logger?.info(
      {
        prId,
        provider: choice.provider,
        model: outcome.model,
        headSha,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        costUsd: outcome.costUsd,
        specsRead: specsRead.length,
        risks: clamped.risks.length,
        focusKept: clamped.review_focus.length,
        focusDropped: focus.dropped,
        refsKept: risks.kept.reduce((n, r) => n + r.file_refs.length, 0),
        refsDropped: risks.droppedRefs,
        blastDegraded: blast.degraded === true,
        historyDegraded: history.degraded === true,
        durationMs: Date.now() - started,
      },
      'brief: generated',
    );
    return toBriefResponse(brief, headSha, false);
  }

  /** The stored intent (even a stale one) as it is, else derive one now. */
  private async resolveIntent(
    workspaceId: string,
    prId: string,
    logger?: ChildableLogger,
  ): Promise<PrIntentRecord> {
    const stored = await this.container.intent.get(workspaceId, prId);
    if (stored.intent) return stored.intent;
    const derived = await this.container.intent.derive(workspaceId, prId, logger);
    if (!derived.intent) throw new ExternalServiceError('Intent derivation failed: no intent was stored.');
    return derived.intent;
  }

  /** Docs of every enabled agent (own + inherited), each path once, agents by name then id. */
  private async collectDocs(
    workspaceId: string,
    repo: { owner: string; name: string; clonePath: string | null },
  ): Promise<ProjectDoc[]> {
    const agents = (await this.container.agentsRepo.listEnabled(workspaceId)).sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    const seen = new Set<string>();
    const docs: ProjectDoc[] = [];
    for (const agent of agents) {
      const res = await this.container.projectContext.resolveForRun({
        workspaceId,
        agentId: agent.id,
        repo: { owner: repo.owner, name: repo.name },
        cloned: repo.clonePath != null,
      });
      for (const doc of res.docs) {
        if (seen.has(doc.source)) continue;
        seen.add(doc.source);
        docs.push(doc);
      }
    }
    return docs;
  }

  private async requirePull(workspaceId: string, prId: string) {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError(PULL_NOT_FOUND_MESSAGE);
    return pull;
  }
}
