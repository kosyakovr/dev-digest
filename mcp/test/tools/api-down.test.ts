/**
 * WP7.tests — every read tool with the DevDigest API unreachable (AC-3): the
 * server keeps answering after each isError.
 */
import { describe, expect, it } from 'vitest';
import { HttpDevDigestApi, type FetchImpl } from '../../src/api/http.js';
import { Resolver } from '../../src/resolve.js';
import { createServer } from '../../src/server.js';
import { connectClient } from '../helpers/mcp-client.js';

function connectionRefusedFetch(): FetchImpl {
  return (async () => {
    const err = new TypeError('fetch failed');
    (err as unknown as { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
    throw err;
  }) as FetchImpl;
}

describe('tools 1, 3, 4 with the DevDigest API unreachable', () => {
  it('each return isError E1, and the server keeps answering afterwards', async () => {
    const api = new HttpDevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: connectionRefusedFetch() });
    const server = createServer({ api, resolver: new Resolver(api) });
    const client = await connectClient(server);

    const listAgents = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
    expect(listAgents.isError).toBe(true);
    expect((listAgents.content as { text: string }[])[0]?.text).toMatch(
      /^DevDigest API is not reachable at http:\/\/localhost:3001/,
    );

    const getFindings = await client.callTool({
      name: 'devdigest_get_findings',
      arguments: { pr: 'acme/payments-api#482' },
    });
    expect(getFindings.isError).toBe(true);
    expect((getFindings.content as { text: string }[])[0]?.text).toMatch(
      /^DevDigest API is not reachable at http:\/\/localhost:3001/,
    );

    const getConventions = await client.callTool({
      name: 'devdigest_get_conventions',
      arguments: { repo: 'acme/payments-api' },
    });
    expect(getConventions.isError).toBe(true);
    expect((getConventions.content as { text: string }[])[0]?.text).toMatch(
      /^DevDigest API is not reachable at http:\/\/localhost:3001/,
    );

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('devdigest_list_agents');
  });
});
