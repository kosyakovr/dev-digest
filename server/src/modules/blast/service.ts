import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ChildableLogger } from '../../platform/prompt-log.js';
import { NotFoundError } from '../../platform/errors.js';
import { blastCounts, toBlastRadius } from './helpers.js';

/**
 * Blast radius use case (ring ②). No HTTP and no SQL: the PR and its files come
 * from `container.reviewRepo`, the blast from the `container.repoIntel` facade
 * (persistent index only), mapped onto the wire contract by `helpers.ts`.
 */
export class BlastService {
  constructor(private container: Container) {}

  async getBlast(
    workspaceId: string,
    prId: string,
    logger?: ChildableLogger,
  ): Promise<BlastRadius> {
    const started = Date.now();
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.container.reviewRepo.getPrFiles(pull.id);
    const paths = files.map((f) => f.path);
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, paths);
    const radius = toBlastRadius(result);
    const counts = blastCounts(radius);

    logger?.info(
      {
        prId,
        repoId: pull.repoId,
        source: result.source,
        degraded: result.degraded ?? false,
        reason: result.reason,
        indexedSha: result.indexedSha,
        changedFiles: paths.length,
        symbols: counts.symbols,
        callers: counts.callers,
        endpoints: counts.endpoints,
        crons: counts.crons,
        ms: Date.now() - started,
      },
      'blast: computed',
    );
    return radius;
  }
}
