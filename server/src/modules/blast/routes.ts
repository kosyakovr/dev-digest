import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';
import { PrHistoryService } from './history.js';

/**
 * Blast module (ring ④). The only file here that imports fastify.
 *
 *   GET /pulls/:id/blast    → blast radius from the persistent index
 *   GET /pulls/:id/history  → prior merged PRs touching the same files (GitHub)
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const blast = new BlastService(app.container);
  const history = new PrHistoryService(app.container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return blast.getBlast(workspaceId, req.params.id, req.log.child({ correlationId: req.id }));
    },
  );

  app.get(
    '/pulls/:id/history',
    {
      schema: { params: IdParams, response: { 200: PrHistory } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return history.getHistory(workspaceId, req.params.id, req.log.child({ correlationId: req.id }));
    },
  );
}
