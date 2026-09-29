/**
 * Boundary (ring ④) — devdigest_get_blast_radius (stub). No outputSchema, no
 * use case, no port call. Always returns E20.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { blastRadiusNotImplemented } from '../errors.js';
import { toolError } from './result.js';
import { wrap } from './wrap.js';
import type { ToolDeps } from './list-agents.js';

const inputShape = {
  pr: z.string().min(1).describe('owner/repo#123, GitHub PR URL, or DevDigest PR id'),
};

export function register(server: McpServer, _deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      description:
        "Not implemented yet: will show which code a pull request's changes affect. Currently always returns an error.",
      inputSchema: inputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    wrap('devdigest_get_blast_radius', async () => {
      return toolError(blastRadiusNotImplemented().message);
    }),
  );
}
