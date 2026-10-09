import type { BlastRadius, PrHistory } from '@devdigest/shared';
import type { ChildableLogger } from '../../platform/prompt-log.js';

/**
 * Blast module types (ring ②). `PrBlastFacade` is the one thing other modules
 * see: the brief reaches blast radius and prior-PR history through
 * `container.prBlast`, never by importing this folder. Both methods degrade
 * (a `degraded` result) instead of throwing on index or GitHub state; they
 * throw only `NotFoundError` for an unknown pull request.
 */
export interface PrBlastFacade {
  getBlast(workspaceId: string, prId: string, logger?: ChildableLogger): Promise<BlastRadius>;
  getHistory(workspaceId: string, prId: string, logger?: ChildableLogger): Promise<PrHistory>;
}
