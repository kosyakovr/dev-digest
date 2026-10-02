/**
 * Ring ④: the composition root and the ONLY file that reads `process.env` (through
 * `./config.ts`) or constructs adapters. stdout is reserved for the MCP transport:
 * everything human-readable goes to stderr. The process ends when stdin closes.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { systemClock } from './adapters/clock.ts';
import { HttpDevDigestApi } from './adapters/http/client.ts';
import { createHttp } from './adapters/http/http.ts';
import { ConfigError, loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { createLogger } from './log.ts';
import { createDevDigestMcpServer } from './server.ts';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`devdigest-mcp: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);
  const api = new HttpDevDigestApi(createHttp(config.apiUrl, logger));
  const server = createDevDigestMcpServer({ api, clock: systemClock, logger, baseUrl: config.apiUrl });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    server
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(new StdioServerTransport());
  logger.info(`devdigest-mcp ready (api ${config.apiUrl})`);
}

main().catch((err: unknown) => {
  process.stderr.write(`devdigest-mcp: fatal ${err instanceof Error ? err.message : 'error'}\n`);
  process.exit(1);
});
