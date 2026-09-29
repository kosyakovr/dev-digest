/**
 * WP7.tests — devdigest_list_agents, driven through the SDK (Contract §
 * Doubles: "Tool tests drive an SDK Client connected through InMemoryTransport").
 */
import { describe, expect, it } from 'vitest';
import { Resolver } from '../../src/resolve.js';
import { createServer } from '../../src/server.js';
import { FakeDevDigestApi } from '../../src/api/fake-api.js';
import { connectClient } from '../helpers/mcp-client.js';
import { GR_ID, GR_NAME, SR_ID, SR_NAME } from '../helpers/fixtures.js';

async function setup(): Promise<{ fake: FakeDevDigestApi; client: Awaited<ReturnType<typeof connectClient>> }> {
  const fake = new FakeDevDigestApi();
  const server = createServer({ api: fake, resolver: new Resolver(fake) });
  const client = await connectClient(server);
  return { fake, client };
}

describe('devdigest_list_agents', () => {
  it('returns the concise agent list with count, and the raw text mirrors structuredContent (AC-4)', async () => {
    const { fake, client } = await setup();
    fake.agents = [
      { id: GR_ID, name: GR_NAME, model: 'gpt-4o', enabled: true },
      { id: SR_ID, name: SR_NAME, model: 'gpt-4o-mini', enabled: false },
    ];

    const result = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      agents: [
        { id: GR_ID, name: GR_NAME, enabled: true, model: 'gpt-4o' },
        { id: SR_ID, name: SR_NAME, enabled: false, model: 'gpt-4o-mini' },
      ],
      count: 2,
    });
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).not.toMatch(/system_prompt/);
    expect(text).toBe(JSON.stringify(result.structuredContent));
    // SR-1 — agent config is local and trusted: no untrusted_notice here.
    expect(Object.keys(result.structuredContent as object)).not.toContain('untrusted_notice');
  });

  it('adds description, provider, strategy and version in detailed format', async () => {
    const { fake, client } = await setup();
    fake.agents = [
      {
        id: GR_ID,
        name: GR_NAME,
        model: 'gpt-4o',
        enabled: true,
        description: 'Reviews everything',
        provider: 'openai',
        strategy: 'single-pass',
        version: 3,
      },
    ];

    const result = await client.callTool({
      name: 'devdigest_list_agents',
      arguments: { response_format: 'detailed' },
    });

    expect(result.structuredContent).toMatchObject({
      agents: [
        {
          id: GR_ID,
          name: GR_NAME,
          enabled: true,
          model: 'gpt-4o',
          description: 'Reviews everything',
          provider: 'openai',
          strategy: 'single-pass',
          version: 3,
        },
      ],
    });
  });

  it('returns count:0 and a hint pointing at the DevDigest web app when there are no agents', async () => {
    const { fake, client } = await setup();
    fake.agents = [];

    const result = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });

    expect(result.structuredContent).toEqual({
      agents: [],
      count: 0,
      hint: 'No agents configured — create one in the DevDigest web app (Agents).',
    });
  });

  it('always fetches fresh: two consecutive calls make two listAgents port calls', async () => {
    const { fake, client } = await setup();
    fake.agents = [{ id: GR_ID, name: GR_NAME, model: 'gpt-4o', enabled: true }];

    await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
    await client.callTool({ name: 'devdigest_list_agents', arguments: {} });

    expect(fake.calls.filter((c) => c.method === 'listAgents')).toHaveLength(2);
  });
});
