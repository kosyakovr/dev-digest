import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BRIEF_RATE_LIMIT } from './constants.js';
import { BriefService } from './service.js';

/**
 * L05 risk brief module (ring ④). The only file here that imports fastify.
 *
 *   GET  /pulls/:id/brief   → the stored brief + generating/stale flags
 *   POST /pulls/:id/brief   → build, store and return a new brief
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // ONE service per app: it holds the in-process "already generating" guard.
  const service = new BriefService(app.container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getState(workspaceId, req.params.id, req.log.child({ correlationId: req.id }));
    },
  );

  // Synchronous on purpose: one model call, and the client shows a pending button.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: BRIEF_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id, req.log.child({ correlationId: req.id }));
    },
  );
}
