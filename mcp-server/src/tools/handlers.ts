/**
 * Ring ④: one handler per tool. Each calls its use case (`list_agents` calls the
 * port directly: a pass-through use case would be ceremony), renders text and turns
 * any thrown error into an `isError` result with no stack trace and no raw body.
 * The handlers see parsed input only; the SDK validated it against the schemas in
 * `./definitions.ts`.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Clock } from '../core/clock.ts';
import { DevDigestError } from '../core/errors.ts';
import type { DevDigestApi } from '../core/port.ts';
import {
  BLAST_RADIUS_NOT_IMPLEMENTED,
  renderAgents,
  renderConventions,
  renderError,
  renderFindings,
  renderRunOutcome,
} from '../format/text.ts';
import { callsUntil, TIMEOUT_AGENTS_MS } from '../usecases/budget.ts';
import { getConventions } from '../usecases/conventions.ts';
import { getFindings } from '../usecases/findings.ts';
import { runAgentOnPr } from '../usecases/run-review.ts';
import type { Logger } from '../log.ts';
import type {
  getBlastRadiusTool,
  getConventionsTool,
  getFindingsTool,
  listAgentsTool,
  runAgentOnPrTool,
} from './definitions.ts';

type Args<T extends { inputSchema: z.ZodRawShape }> = z.output<z.ZodObject<T['inputSchema']>>;

/** What a handler needs from the SDK's per-request extra. */
export interface HandlerExtra {
  signal?: AbortSignal | undefined;
  /** Present only when the request carries a `progressToken`. */
  sendProgress?: ((progress: number, message: string) => void) | undefined;
}

export interface HandlerDeps {
  api: DevDigestApi;
  clock: Clock;
  logger: Logger;
  baseUrl: string;
}

export interface Handlers {
  list_agents(args: Args<typeof listAgentsTool>, extra: HandlerExtra): Promise<CallToolResult>;
  run_agent_on_pr(args: Args<typeof runAgentOnPrTool>, extra: HandlerExtra): Promise<CallToolResult>;
  get_findings(args: Args<typeof getFindingsTool>, extra: HandlerExtra): Promise<CallToolResult>;
  get_conventions(args: Args<typeof getConventionsTool>, extra: HandlerExtra): Promise<CallToolResult>;
  get_blast_radius(args: Args<typeof getBlastRadiusTool>, extra: HandlerExtra): Promise<CallToolResult>;
}

const text = (t: string, isError = false): CallToolResult =>
  isError ? { isError: true, content: [{ type: 'text', text: t }] } : { content: [{ type: 'text', text: t }] };

export function createHandlers(deps: HandlerDeps): Handlers {
  const { api, clock, logger, baseUrl } = deps;

  async function guard(tool: string, run: () => Promise<string>): Promise<CallToolResult> {
    try {
      return text(await run());
    } catch (err) {
      logger.error(
        err instanceof DevDigestError ? `${tool} failed: ${err.kind}` : `${tool} failed: ${err instanceof Error ? err.name : 'unknown'}`,
      );
      return text(renderError(err, { baseUrl }), true);
    }
  }

  return {
    list_agents: (args, extra) =>
      guard('list_agents', async () => {
        const calls = callsUntil(Number.POSITIVE_INFINITY, clock, extra.signal);
        return renderAgents(await api.listAgents(calls(TIMEOUT_AGENTS_MS)), args.response_format);
      }),

    run_agent_on_pr: (args, extra) =>
      guard('run_agent_on_pr', async () => {
        const outcome = await runAgentOnPr(
          { api, clock },
          { pr: args.pr, agent: args.agent },
          {
            signal: extra.signal,
            ...(extra.sendProgress ? { onProgress: extra.sendProgress } : {}),
          },
        );
        return renderRunOutcome(outcome, args.response_format);
      }),

    get_findings: (args, extra) =>
      guard('get_findings', async () => {
        const view = await getFindings(
          { api, clock },
          {
            pr: args.pr,
            run_id: args.run_id,
            agent: args.agent,
            min_severity: args.min_severity,
            limit: args.limit,
            offset: args.offset,
          },
          extra.signal,
        );
        return renderFindings(view, args.response_format);
      }),

    get_conventions: (args, extra) =>
      guard('get_conventions', async () => {
        const view = await getConventions(
          { api, clock },
          { repo: args.repo, status: args.status, limit: args.limit, offset: args.offset },
          extra.signal,
        );
        return renderConventions(view, args.response_format);
      }),

    get_blast_radius: () => Promise.resolve(text(BLAST_RADIUS_NOT_IMPLEMENTED, true)),
  };
}
