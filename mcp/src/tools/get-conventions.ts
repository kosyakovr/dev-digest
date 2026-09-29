/**
 * Boundary (ring ④) — devdigest_get_conventions. Parses, delegates to the
 * use case, maps the result. No `api.`/`resolver.` call here.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConventions } from '../use-cases/get-conventions.js';
import { GetConventionsOutput } from '../contracts.js';
import { toolResult } from './result.js';
import { wrap } from './wrap.js';
import type { ToolDeps } from './list-agents.js';

const inputShape = {
  repo: z.string().min(1).describe('owner/repo or DevDigest repo id'),
  status: z
    .enum(['accepted', 'pending', 'rejected', 'all'])
    .default('accepted')
    .describe('Which conventions'),
  response_format: z.enum(['concise', 'detailed']).default('concise'),
};

const outputShape = GetConventionsOutput.shape;

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_conventions',
    {
      description: "List a repository's coding conventions extracted by DevDigest (accepted ones by default).",
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    wrap('devdigest_get_conventions', async (args, extra) => {
      const out = await getConventions(deps, args, extra.signal);
      return toolResult(out);
    }),
  );
}
