/**
 * Boundary (ring ④) — devdigest_get_findings. Parses, delegates to the use
 * case, maps the result. No `api.`/`resolver.` call here.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getFindings } from '../use-cases/get-findings.js';
import { toolResult } from './result.js';
import { wrap } from './wrap.js';
import type { ToolDeps } from './list-agents.js';

const inputShape = {
  pr: z.string().min(1).describe('owner/repo#123, GitHub PR URL, or DevDigest PR id'),
  run_id: z.string().uuid().optional().describe('Run id from devdigest_run_review'),
  agent: z.string().min(1).optional().describe('Agent name or id'),
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']).optional().describe('Minimum severity'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max findings per page'),
  cursor: z.string().optional().describe('next_cursor from the previous page'),
  response_format: z.enum(['concise', 'detailed']).default('concise'),
};

const reviewShape = {
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().nullable(),
  findings_count: z.number(),
  created_at: z.string(),
  review_id: z.string().optional(),
  summary: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
};

const findingShape = {
  severity: z.string(),
  title: z.string(),
  loc: z.string(),
  agent_name: z.string().nullable(),
  id: z.string().optional(),
  category: z.string().optional(),
  rationale: z.string().optional(),
  suggestion: z.string().nullable().optional(),
  confidence: z.number().optional(),
  kind: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),
};

const outputShape = {
  untrusted_notice: z.string(),
  pr: z.string(),
  pr_title: z.string(),
  pr_id: z.string().optional(),
  status: z.literal('running').optional(),
  run_id: z.string().optional(),
  agent_name: z.string().nullable().optional(),
  reviews: z.array(z.object(reviewShape)),
  findings: z.array(z.object(findingShape)),
  total: z.number(),
  next_cursor: z.string().nullable(),
  hint: z.string().optional(),
};

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_get_findings',
    {
      description:
        'Get findings of finished DevDigest reviews on a pull request: the latest review per agent, or one run by run_id.',
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    wrap('devdigest_get_findings', async (args, extra) => {
      const out = await getFindings(deps, args, extra.signal);
      return toolResult(out);
    }),
  );
}
