import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * L02 — conventions module (ring ④). The only file here that imports fastify.
 *
 *   GET    /repos/:id/conventions          → candidates for the repo
 *   POST   /repos/:id/conventions/extract  → scan (one model call)
 *   POST   /repos/:id/conventions/skill    → skill DRAFT from the selected ids
 *   PATCH  /conventions/:id                → accept / reject / edit
 *   DELETE /conventions/:id                → drop a candidate
 */

const SkillDraftBody = z.object({
  convention_ids: z.array(z.string().uuid()).min(1),
});

const UpdateConventionBody = z
  .object({
    rule: z.string().min(1).optional(),
    rationale: z.string().nullable().optional(),
    status: ConventionStatus.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update.' });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  // Synchronous on purpose: one model call, and the client shows a pending
  // button. The JobRunner's 120s default timeout buys nothing here and would
  // cost the caller the result.
  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: SkillDraftBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id, req.body.convention_ids);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.setStatus(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const removed = await service.remove(workspaceId, req.params.id);
    if (!removed) throw new NotFoundError('Convention not found');
    return reply.status(204).send();
  });
}
