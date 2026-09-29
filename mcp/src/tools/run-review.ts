/**
 * Boundary (ring ④) — devdigest_run_review. Parses, delegates to the use
 * case, maps the result. No `api.`/`resolver.` call here. Owns the MCP-only
 * concerns the use case must not see: `extra`, the progress token, the
 * leading-edge throttle.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { runReview } from '../use-cases/run-review.js';
import { PROGRESS_THROTTLE_MS } from '../constants.js';
import { RunReviewOutput } from '../contracts.js';
import { toolError, toolResult, type ToolCallResult } from './result.js';
import { wrap } from './wrap.js';
import type { ToolDeps } from './list-agents.js';

const inputShape = {
  pr: z.string().min(1).describe('owner/repo#123, GitHub PR URL, or DevDigest PR id'),
  agent: z.string().min(1).describe('Agent name or id (devdigest_list_agents)'),
  limit: z.number().int().min(1).max(50).default(10).describe('Max findings returned'),
};

const outputShape = RunReviewOutput.shape;

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'devdigest_run_review',
    {
      description:
        'Run one DevDigest reviewer agent on a pull request (code review) and wait up to ~100 s for findings; if still running, returns run_id for devdigest_get_findings. Paid LLM calls; one agent per call.',
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    wrap('devdigest_run_review', async (args, extra: Extra): Promise<ToolCallResult> => {
      const onProgress = buildProgressReporter(extra);
      const result = await runReview(deps, args, { signal: extra.signal, onProgress });
      if (result === null) return toolError('Cancelled.');
      return toolResult(result);
    }),
  );
}

/** Leading-edge throttle: at most one notification per `PROGRESS_THROTTLE_MS`,
 * skipped messages dropped. Only sends when the caller asked for progress
 * (a `_meta.progressToken` on the request). */
function buildProgressReporter(extra: Extra): ((msg: string) => void) | undefined {
  const progressToken = extra._meta?.progressToken;
  if (progressToken === undefined) return undefined;

  let lastSentAt = -Infinity;
  let n = 0;
  return (message: string): void => {
    const now = Date.now();
    if (now - lastSentAt < PROGRESS_THROTTLE_MS) return;
    lastSentAt = now;
    n += 1;
    void extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress: n, message },
    });
  };
}
