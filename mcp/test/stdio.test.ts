/**
 * WP7.tests (TP-2) — stdout cleanliness over the real `StdioServerTransport`:
 * every stdout line is JSON-RPC 2.0, including on an API-down tool call, and
 * a bad DEVDIGEST_API_BASE exits 1 with empty stdout (AC-3, AC-12).
 */
import { describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mcpRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const tsx = path.join(mcpRoot, 'node_modules', '.bin', 'tsx');
const entry = path.join(mcpRoot, 'src', 'index.ts');

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  result?: unknown;
  error?: unknown;
}

function request(id: number, method: string, params: unknown = {}): string {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
}
function notification(method: string, params: unknown = {}): string {
  return `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`;
}

function spawnServer(env: Record<string, string | undefined>): ChildProcessWithoutNullStreams {
  return spawn(tsx, [entry], {
    cwd: mcpRoot,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('stdio transport', () => {
  it(
    'every stdout line is JSON-RPC 2.0, and tools/call while the API is unreachable is isError over the wire',
    async () => {
      const child = spawnServer({ DEVDIGEST_API_BASE: 'http://127.0.0.1:1' });
      const lines: string[] = [];
      const responses = new Map<number, JsonRpcMessage>();
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        lines.push(line);
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (typeof msg.id === 'number') responses.set(msg.id, msg);
        } catch {
          // asserted below via JSON.parse on every line
        }
      });

      try {
        child.stdin.write(
          request(1, 'initialize', {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'devdigest-mcp-test', version: '0.0.0' },
          }),
        );
        child.stdin.write(notification('notifications/initialized'));
        child.stdin.write(request(2, 'tools/list'));
        child.stdin.write(request(3, 'tools/call', { name: 'devdigest_list_agents', arguments: {} }));

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timed out waiting for tools/call response')), 15_000);
          const check = setInterval(() => {
            if (responses.has(3)) {
              clearInterval(check);
              clearTimeout(timer);
              resolve();
            }
          }, 25);
        });
        child.stdin.end();

        const exitCode = await new Promise<number>((resolve) => {
          child.on('exit', (code) => resolve(code ?? -1));
        });

        expect(exitCode).toBe(0);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        for (const line of lines) {
          const parsed = JSON.parse(line) as JsonRpcMessage;
          expect(parsed.jsonrpc).toBe('2.0');
        }

        const callResult = responses.get(3)?.result as
          | { isError?: boolean; content?: { text: string }[] }
          | undefined;
        expect(callResult?.isError).toBe(true);
        expect(callResult?.content?.[0]?.text).toMatch(/^DevDigest API is not reachable at http:\/\/127\.0\.0\.1:1/);
      } finally {
        child.kill();
      }
    },
    20_000,
  );

  it(
    'a bad DEVDIGEST_API_BASE exits 1 with empty stdout and a stderr message',
    async () => {
      const child = spawnServer({ DEVDIGEST_API_BASE: 'ftp://x' });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.stdin.end();

      try {
        const exitCode = await new Promise<number>((resolve) => {
          child.on('exit', (code) => resolve(code ?? -1));
        });

        expect(exitCode).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toContain('must be an http(s) URL');
      } finally {
        child.kill();
      }
    },
    20_000,
  );
});
