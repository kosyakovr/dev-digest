/**
 * WP7.tests — devdigest_get_blast_radius (stub), driven through the SDK.
 */
import { describe, expect, it } from 'vitest';
import { Resolver } from '../../src/resolve.js';
import { createServer } from '../../src/server.js';
import { connectClient } from '../helpers/mcp-client.js';
import { makeFake } from '../helpers/fixtures.js';

describe('devdigest_get_blast_radius', () => {
  it('always returns isError E20 and makes no port call (AC-11)', async () => {
    const fake = makeFake();
    const server = createServer({ api: fake, resolver: new Resolver(fake) });
    const client = await connectClient(server);

    const result = await client.callTool({
      name: 'devdigest_get_blast_radius',
      arguments: { pr: 'acme/payments-api#482' },
    });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toBe(
      'devdigest_get_blast_radius is not implemented yet. For review results on this PR use devdigest_get_findings.',
    );
    expect(fake.calls).toHaveLength(0);
  });
});
