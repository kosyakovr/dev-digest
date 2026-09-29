/**
 * Boundary (ring ④) — devdigest_list_agents. Parses, delegates to the use
 * case, maps the result. No `api.`/`resolver.` call here.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAgents } from '../use-cases/list-agents.js';
import type { DevDigestApi } from '../ports.js';
import type { Resolver } from '../resolve.js';
import { toolResult } from './result.js';
import { wrap } from './wrap.js';

export interface ToolDeps {
  api: DevDigestApi;
  resolver: Resolver;
}

const inputShape = {
  response_format: z.enum(['concise', 'detailed']).default('concise'),
};

const agentShape = {
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  model: z.string(),
  description: z.string().optional(),
  provider: z.string().optional(),
  strategy: z.string().optional(),
  version: z.number().optional(),
};

const outputShape = {
  agents: z.array(z.object(agentShape)),
  count: z.number(),
  hint: z.string().optional(),
};

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_list_agents',
    {
      description:
        'List DevDigest reviewer agents (id, name, enabled, model). Pass a name or id to devdigest_run_review.',
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    wrap('devdigest_list_agents', async (args, extra) => {
      const out = await listAgents(deps, args, extra.signal);
      return toolResult(out);
    }),
  );
}
