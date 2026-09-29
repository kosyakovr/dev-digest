/**
 * Boundary + composition (ring ④) — builds the `McpServer` and registers
 * every tool. No `instructions`, no `alwaysLoad`. May import everything
 * except `api/` values (the caller passes an already-constructed
 * `DevDigestApi`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './ports.js';
import type { Resolver } from './resolve.js';
import { register as registerListAgents } from './tools/list-agents.js';
import { register as registerGetFindings } from './tools/get-findings.js';
import { register as registerGetConventions } from './tools/get-conventions.js';
import { register as registerBlastRadius } from './tools/blast-radius.js';
import { register as registerRunReview } from './tools/run-review.js';

export interface ServerDeps {
  api: DevDigestApi;
  resolver: Resolver;
}

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
  registerListAgents(server, deps);
  registerRunReview(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerBlastRadius(server, deps);
  return server;
}
