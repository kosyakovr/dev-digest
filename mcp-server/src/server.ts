/**
 * Ring ④: builds the MCP server and registers the tools, without connecting a
 * transport (so tests can connect an in-memory one). Never constructs an adapter
 * and never reads the environment: everything arrives through the arguments.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clock } from './core/clock.ts';
import type { DevDigestApi } from './core/port.ts';
import { DEFAULT_API_URL } from './config.ts';
import type { Logger } from './log.ts';
import { TOOL_DEFINITIONS } from './tools/definitions.ts';
import type { HandlerExtra } from './tools/handlers.ts';
import { createHandlers } from './tools/handlers.ts';

export interface ServerDeps {
  api: DevDigestApi;
  clock: Clock;
  logger: Logger;
  /** Shown in "not reachable" errors. */
  baseUrl?: string;
}

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.1.0';

type SdkExtra = {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number } | undefined;
  sendNotification: (n: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
};

function toHandlerExtra(extra: SdkExtra, logger: Logger): HandlerExtra {
  const token = extra._meta?.progressToken;
  return {
    signal: extra.signal,
    sendProgress:
      token === undefined
        ? undefined
        : (progress, message) => {
            extra
              .sendNotification({
                method: 'notifications/progress',
                params: { progressToken: token, progress, message },
              })
              .catch(() => logger.debug('progress notification failed'));
          },
  };
}

export function createDevDigestMcpServer(deps: ServerDeps): McpServer {
  const { logger } = deps;
  const handlers = createHandlers({
    api: deps.api,
    clock: deps.clock,
    logger,
    baseUrl: deps.baseUrl ?? DEFAULT_API_URL,
  });
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const tool of TOOL_DEFINITIONS) {
    const handler = handlers[tool.name] as (args: unknown, extra: HandlerExtra) => Promise<CallToolResult>;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        annotations: { ...tool.annotations },
        inputSchema: tool.inputSchema,
      },
      (args: unknown, extra: SdkExtra) => handler(args, toHandlerExtra(extra, logger)),
    );
  }
  return server;
}
