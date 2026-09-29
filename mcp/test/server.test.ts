/**
 * WP8.tests — server surface: tool list, instructions, description/describe
 * length budgets, annotations (Contract § Tool 1-5, AC-1, AC-2).
 */
import { describe, expect, it } from 'vitest';
import { FakeDevDigestApi } from '../src/api/fake-api.js';
import { Resolver } from '../src/resolve.js';
import { createServer } from '../src/server.js';
import { connectClient } from './helpers/mcp-client.js';

async function setup(): Promise<Awaited<ReturnType<typeof connectClient>>> {
  const fake = new FakeDevDigestApi();
  const server = createServer({ api: fake, resolver: new Resolver(fake) });
  return connectClient(server);
}

describe('server surface', () => {
  it('exposes exactly the five tools in registration order, with no server instructions', async () => {
    const client = await setup();

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).toEqual([
      'devdigest_list_agents',
      'devdigest_run_review',
      'devdigest_get_findings',
      'devdigest_get_conventions',
      'devdigest_get_blast_radius',
    ]);
    expect(client.getInstructions()).toBeUndefined();
  });

  it('keeps every description within 200 chars, and gives response_format no description key', async () => {
    const client = await setup();

    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description?.length ?? 0).toBeLessThanOrEqual(200);
      const properties =
        (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      // response_format (Contract § Common input) is only on the read tools
      // that project concise/detailed output — not run_review (pr/agent/limit
      // only) or the blast_radius stub (pr only).
      const hasResponseFormat = [
        'devdigest_list_agents',
        'devdigest_get_findings',
        'devdigest_get_conventions',
      ].includes(tool.name);
      if (hasResponseFormat) {
        expect(properties.response_format).toBeDefined();
        expect(properties.response_format).not.toHaveProperty('description');
      } else {
        expect(properties.response_format).toBeUndefined();
      }
    }
  });

  it('keeps every non-response_format input .describe() within 80 chars', async () => {
    const client = await setup();

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const properties =
        (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      for (const [name, prop] of Object.entries(properties)) {
        if (name === 'response_format') continue;
        if (prop.description !== undefined) {
          expect(prop.description.length).toBeLessThanOrEqual(80);
        }
      }
    }
  });

  it('sets run_review to writable/unsafe/open-world; the other four to read-only/idempotent/closed-world', async () => {
    const client = await setup();

    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));

    expect(byName.devdigest_run_review).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    for (const name of [
      'devdigest_list_agents',
      'devdigest_get_findings',
      'devdigest_get_conventions',
      'devdigest_get_blast_radius',
    ]) {
      expect(byName[name]).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it('lists untrusted_notice as a required outputSchema field for run_review, get_findings and get_conventions (SR-1)', async () => {
    const client = await setup();

    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    for (const name of ['devdigest_run_review', 'devdigest_get_findings', 'devdigest_get_conventions']) {
      const outputSchema = byName[name]?.outputSchema as { required?: string[] } | undefined;
      expect(outputSchema?.required, `${name} outputSchema.required`).toContain('untrusted_notice');
    }
  });

  it('does not give devdigest_list_agents an untrusted_notice outputSchema field, and leaves the blast_radius stub without an outputSchema (SR-1)', async () => {
    const client = await setup();

    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    const listAgentsOutput = byName.devdigest_list_agents?.outputSchema as
      | { properties?: Record<string, unknown>; required?: string[] }
      | undefined;
    expect(listAgentsOutput?.properties).not.toHaveProperty('untrusted_notice');
    expect(listAgentsOutput?.required ?? []).not.toContain('untrusted_notice');

    expect(byName.devdigest_get_blast_radius?.outputSchema).toBeUndefined();
  });
});
