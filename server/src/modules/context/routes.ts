import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentContext, ContextItem, ContextPaths, ContextSources, SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { isValidAttachmentPath } from './helpers.js';
import { ContextService } from './service.js';

/**
 * L05 — project-context module (ring ④). The only file here that imports fastify.
 *
 *   GET /context/sources                   → configured folder names
 *   GET /repos/:id/context                 → the repo's docs (cached per clone HEAD)
 *   GET /repos/:id/context/file?path=      → one doc with its content
 *   GET|PUT /agents/:id/context            → an agent's attached docs (+ inherited)
 *   GET|PUT /skills/:id/context            → a skill's attached docs
 */

const FileQuery = z.object({ path: z.string().min(1) });

/** The PUT body: every path must be a safe repo-relative `.md` path. */
const ContextPathsBody = z.object({
  items: z.array(
    ContextItem.extend({
      path: z.string().min(1).refine(isValidAttachmentPath, { message: 'Invalid document path.' }),
    }),
  ),
});

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // ONE service per app: it holds the per-HEAD list cache.
  const service = new ContextService(app.container);

  app.get('/context/sources', { schema: { response: { 200: ContextSources } } }, async () =>
    service.sources(),
  );

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: z.array(SpecFile) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: SpecFile } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, response: { 200: AgentContext } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getAgentContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: ContextPathsBody, response: { 200: AgentContext } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAgentContext(workspaceId, req.params.id, req.body.items);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, response: { 200: ContextPaths } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getSkillContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: ContextPathsBody, response: { 200: ContextPaths } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setSkillContext(workspaceId, req.params.id, req.body.items);
    },
  );
}
