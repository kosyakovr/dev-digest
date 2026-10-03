import type { PrIntentResponse, RepoRef, UnifiedDiff } from '@devdigest/shared';
import type { ReviewIntent } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { logPrompt } from '../../platform/prompt-log.js';
import { ConfigError, ExternalServiceError, NotFoundError, ValidationError, AppError } from '../../platform/errors.js';
import type { NewPrIntentRow, PrIntentRow, PullRow } from '../../db/rows.js';
import {
  INTENT_MAX_RETRIES,
  INTENT_MAX_TOKENS,
  INTENT_PROMPT_VERSION,
  INTENT_REVIEW_BUDGET_MS,
  INTENT_TEMPERATURE,
  INTENT_TIMEOUT_MS,
} from './constants.js';
import {
  clampClassification,
  computeConfidence,
  inputHash,
  toPrIntentDto,
  toReviewIntent,
} from './helpers.js';
import {
  buildUserPrompt,
  ClassificationSchema,
  intentPromptSections,
  PR_INTENT_SCHEMA_NAME,
  SYSTEM_PROMPT,
} from './prompt.js';
import { gatherSources } from './sources.js';
import type { GatherInput, IntentLogger, PrIntentFacade } from './types.js';

/**
 * L03 — the Intent Layer (ring ②). No HTTP and no SQL here: persistence goes
 * through `container.reviewRepo`, the model and git through container ports.
 *
 *   GATHER   title, body, tickets, specs, commits, branch, files, diff (no model)
 *   HASH     sha256 of what determines the answer → reuse the stored row on a match
 *   DERIVE   one structured call on the `review_intent` feature model
 *   CONFIDENCE  computed in code from the sources found; the model can only lower it
 *
 * Intent is context for the reviewers, never a filter: nothing in this module
 * (or in the executor) drops or downgrades a finding because of it.
 * See docs/specs/L03-intent-layer.md.
 */
export class IntentService implements PrIntentFacade {
  constructor(private container: Container) {}

  private get repo() {
    return this.container.reviewRepo;
  }

  /** The stored intent (never calls the model). `stale` = the PR head moved since. */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.repo.getIntent(workspaceId, prId);
    return { intent: row ? toPrIntentDto(row, pull.headSha) : null };
  }

  /** Derive now, ignoring the cache — the user asked for it. */
  async derive(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntentResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');
    const files = await this.repo.getPrFiles(prId);
    const commits = await this.repo.getPrCommits(workspaceId, prId);
    const diffText = files
      .filter((f) => f.patch)
      .map((f) => `diff --git a/${f.path} b/${f.path}\n--- a/${f.path}\n+++ b/${f.path}\n${f.patch}`)
      .join('\n');
    try {
      const { row } = await this.deriveAndStore({
        workspaceId,
        pull,
        repo: { owner: repoRow.owner, name: repoRow.name },
        commits,
        files,
        diffText,
        trigger: 'manual',
        force: true,
        logger,
      });
      return { intent: toPrIntentDto(row, pull.headSha) };
    } catch (err) {
      if (err instanceof ConfigError) throw new ValidationError(err.message, err.details);
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Intent derivation failed: ${(err as Error).message}`);
    }
  }

  async resolveForReview(a: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRef;
    diff: UnifiedDiff;
    runLog: RunLogger;
    logger?: IntentLogger;
  }): Promise<ReviewIntent | undefined> {
    const { workspaceId, pull, runLog, logger } = a;
    try {
      const work = (async () => {
        const commits = await this.repo.getPrCommits(workspaceId, pull.id);
        return this.deriveAndStore({
          workspaceId,
          pull,
          repo: a.repo,
          commits,
          files: a.diff.files,
          diffText: a.diff.raw,
          trigger: 'review',
          force: false,
          logger,
        });
      })();
      // A derivation still in flight after the budget may finish later and persist its row.
      work.catch(() => undefined);
      const { row, cached } = await withBudget(work, INTENT_REVIEW_BUDGET_MS);
      runLog.info(
        cached
          ? `Intent: cached — ${row.confidence} confidence`
          : `Intent: derived — ${row.confidence} confidence (sources: ${usedKinds(row)}) via ${row.provider}/${row.model}`,
      );
      return toReviewIntent(row);
    } catch (err) {
      const reason = (err as Error).message;
      logger?.warn({ prId: pull.id, err: reason }, 'intent: unavailable');
      runLog.info(`Intent unavailable — ${reason}; reviewing without it`);
      return undefined;
    }
  }

  // ---- shared pipeline --------------------------------------------------------------

  private async deriveAndStore(a: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRef;
    commits: GatherInput['commits'];
    files: GatherInput['files'];
    diffText: string;
    trigger: 'review' | 'manual';
    force: boolean;
    logger: IntentLogger | undefined;
  }): Promise<{ row: PrIntentRow; cached: boolean }> {
    const { workspaceId, pull, logger } = a;
    const started = Date.now();
    const choice = await this.container.resolveFeatureModel(workspaceId, 'review_intent');

    const gathered = await gatherSources(
      { git: this.container.git, github: () => this.container.github() },
      {
        repo: a.repo,
        pull: { number: pull.number, title: pull.title, body: pull.body, branch: pull.branch, headSha: pull.headSha },
        commits: a.commits,
        files: a.files,
        diffText: a.diffText,
      },
    );
    const hash = inputHash({
      promptVersion: INTENT_PROMPT_VERSION,
      provider: choice.provider,
      model: choice.model,
      headSha: pull.headSha,
      bundle: gathered.bundle,
    });

    if (!a.force) {
      const stored = await this.repo.getIntent(workspaceId, pull.id);
      if (stored && stored.inputHash === hash) {
        logger?.info({ prId: pull.id, headSha: pull.headSha, inputHash: hash.slice(0, 12) }, 'intent: cache hit');
        return { row: stored, cached: true };
      }
    }

    const userPrompt = buildUserPrompt(gathered.bundle, {
      number: pull.number,
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      headSha: pull.headSha,
    }, a.repo);
    // Metadata only (lengths, sources); the prompt text itself is never logged.
    logPrompt(
      logger,
      {
        kind: 'intent',
        trigger: a.trigger,
        provider: choice.provider,
        model: choice.model,
        sections: intentPromptSections(gathered.bundle),
        totalChars: SYSTEM_PROMPT.length + userPrompt.length,
        systemPrompt: SYSTEM_PROMPT,
      },
      this.container.config.promptLog,
    );

    const llm = await this.container.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ClassificationSchema,
      schemaName: PR_INTENT_SCHEMA_NAME,
      temperature: INTENT_TEMPERATURE,
      maxTokens: INTENT_MAX_TOKENS,
      timeoutMs: INTENT_TIMEOUT_MS,
      maxRetries: INTENT_MAX_RETRIES,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const clamped = clampClassification(res.data);
    if (!clamped.valid) throw new ExternalServiceError('The model returned an empty intent.');

    // A spec was supplied but the classifier cited none of it → one step less confidence.
    const specIgnored = gathered.flags.spec && !clamped.citedSpec;
    if (specIgnored) {
      logger?.warn({ prId: pull.id, specs: gathered.bundle.specs.length }, 'intent: spec ignored by classifier');
    }
    const confidence = computeConfidence({
      ticket: gathered.flags.ticket,
      spec: gathered.flags.spec,
      substantiveBody: gathered.flags.substantiveBody,
      conflict: clamped.sourcesConflict,
      specIgnored,
    });

    const values: Required<NewPrIntentRow> = {
      prId: pull.id,
      intent: clamped.intent,
      inScope: clamped.inScope,
      outOfScope: clamped.outOfScope,
      confidence,
      sources: gathered.sources,
      headSha: pull.headSha,
      inputHash: hash,
      provider: choice.provider,
      model: res.model,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      // null stays null: unknown is not free (docs/specs/L01-run-cost.md § Null semantics).
      costUsd: res.costUsd,
      derivedAt: new Date(),
    };
    await this.repo.upsertIntent(values);
    const row = await this.repo.getIntent(workspaceId, pull.id);
    if (!row) throw new ExternalServiceError('Intent was not persisted.');

    logger?.info(
      {
        prId: pull.id,
        headSha: pull.headSha,
        trigger: a.trigger,
        inputHash: hash.slice(0, 12),
        provider: choice.provider,
        model: res.model,
        confidence,
        used: gathered.sources.filter((s) => s.status === 'used').length,
        unresolved: gathered.sources.filter((s) => s.status === 'unresolved').length,
        evidence: clamped.evidenceCount,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        durationMs: Date.now() - started,
      },
      'intent: derived',
    );
    return { row, cached: false };
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }
}

function usedKinds(row: PrIntentRow): string {
  return [...new Set(row.sources.filter((s) => s.status === 'used').map((s) => s.kind))].join(', ');
}

function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
