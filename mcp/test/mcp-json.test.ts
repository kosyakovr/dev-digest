/**
 * WP9.tests — `.mcp.json` matches the Contract block exactly (AC-14).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('.mcp.json', () => {
  it('equals the exact Contract block', () => {
    const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
    const parsed: unknown = JSON.parse(readFileSync(path.join(repoRoot, '.mcp.json'), 'utf8'));

    expect(parsed).toEqual({
      mcpServers: {
        devdigest: {
          type: 'stdio',
          command: 'node',
          args: ['mcp/dist/index.js'],
        },
      },
    });
  });
});
