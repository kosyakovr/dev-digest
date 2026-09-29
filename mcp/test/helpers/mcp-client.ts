/**
 * Test helper — connects an SDK `Client` to a `McpServer` over
 * `InMemoryTransport.createLinkedPair()` (Contract § Doubles: "Tool tests
 * drive an SDK Client connected through InMemoryTransport").
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'devdigest-mcp-test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}
