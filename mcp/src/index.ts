/**
 * Composition root (ring ④) — the only importer of `api/`. Wires
 * `HttpDevDigestApi`, `Resolver` and `createServer`, connects stdio, and
 * owns process lifetime. Config comes through `config.ts` — the sole reader
 * of the environment in this package.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpDevDigestApi } from './api/http.js';
import { createServer } from './server.js';
import { Resolver } from './resolve.js';
import { loadConfig, ConfigError, type Config } from './config.js';
import { log } from './log.js';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const api = new HttpDevDigestApi({ baseUrl: config.apiBase });
  const resolver = new Resolver(api);
  const server = createServer({ api, resolver });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server
      .close()
      .catch(() => {
        // already closing / closed — nothing to do
      })
      .finally(() => process.exit(0));
  };

  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on('uncaughtException', (err) => {
    log('error', 'uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });

  await server.connect(new StdioServerTransport());
  log('info', `started api=${config.apiBase}`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`devdigest-mcp: fatal error during startup: ${message}\n`);
  process.exit(1);
});
