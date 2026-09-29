/**
 * Use case (ring ②) — devdigest_list_agents. Must not import the SDK,
 * `fetch`, the environment, `api/`, `tools/`, `server.ts`, `index.ts`,
 * `config.ts` or `log.ts`.
 */
import type { Resolver } from '../resolve.js';
import { projectAgent, type ResponseFormat } from '../format.js';

export interface ListAgentsInput {
  response_format: ResponseFormat;
}

export interface ListAgentsDeps {
  resolver: Resolver;
}

export async function listAgents(
  deps: ListAgentsDeps,
  input: ListAgentsInput,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  // Always fresh (never the resolver's cache): an agent created in the web
  // app must show up in the same session.
  const agents = await deps.resolver.agents(signal, { refresh: true });
  const projected = agents.map((a) => projectAgent(a, input.response_format));

  if (projected.length === 0) {
    return {
      agents: projected,
      count: 0,
      hint: 'No agents configured — create one in the DevDigest web app (Agents).',
    };
  }
  return { agents: projected, count: projected.length };
}
