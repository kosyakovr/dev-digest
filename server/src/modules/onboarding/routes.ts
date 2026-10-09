import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingTourState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingTourService } from './service.js';

/**
 * L05 — onboarding tour module (ring ④). The only file here that imports fastify.
 *
 *   GET  /repos/:id/tour            → the stored tour + generating/stale flags
 *   POST /repos/:id/tour/generate   → build, store and return a new tour
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // ONE service per app: it holds the in-process "already generating" guard.
  const service = new OnboardingTourService(app.container);

  app.get(
    '/repos/:id/tour',
    { schema: { params: IdParams, response: { 200: OnboardingTourState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getState(workspaceId, req.params.id, req.log.child({ correlationId: req.id }));
    },
  );

  // Synchronous on purpose: one model call, and the client shows a pending
  // button (the same shape as POST /repos/:id/conventions/extract).
  app.post(
    '/repos/:id/tour/generate',
    { schema: { params: IdParams, response: { 200: OnboardingTourState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id, req.log.child({ correlationId: req.id }));
    },
  );
}
