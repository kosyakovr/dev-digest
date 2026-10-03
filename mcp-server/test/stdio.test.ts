/**
 * The real process: `node src/index.ts` over stdio (Node strips the types).
 * stdout must carry JSON-RPC only; stdin closing ends the process with 0.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

function start(env: Record<string, string>): {
  child: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
  exited: Promise<{ code: number | null; at: number }>;
} {
  const child = spawn(process.execPath, [ENTRY], {
    cwd: PACKAGE_DIR,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (c: Buffer) => (out += c.toString()));
  child.stderr.on('data', (c: Buffer) => (err += c.toString()));
  const exited = new Promise<{ code: number | null; at: number }>((resolve) =>
    child.on('close', (code) => resolve({ code, at: performance.now() })),
  );
  return { child, stdout: () => out, stderr: () => err, exited };
}

type Proc = ReturnType<typeof start>;

/** The exit code, or `'still running'` (after killing the child) when it did not exit within `ms`. */
async function exitWithin(p: Proc, ms: number): Promise<number | null | 'still running'> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'still running'>((resolve) => {
    timer = setTimeout(() => {
      p.child.kill('SIGKILL');
      resolve('still running');
    }, ms);
  });
  const result = await Promise.race([p.exited.then((e) => e.code), late]);
  clearTimeout(timer);
  return result;
}

async function until(cond: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('stdio process', () => {
  it('answers initialize and tools/list with JSON-RPC only on stdout, and exits 0 when stdin ends', async () => {
    const p = start({ DEVDIGEST_API_URL: 'http://127.0.0.1:9' });
    const send = (m: unknown) => p.child.stdin.write(`${JSON.stringify(m)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    });
    await until(() => p.stdout().includes('\n'), 10_000, 'the initialize response');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    await until(() => p.stdout().split('\n').filter(Boolean).length >= 2, 10_000, 'the tools/list response');

    const lines = p.stdout().split('\n').filter((l) => l.length > 0);
    const messages = lines.map((l) => JSON.parse(l) as { jsonrpc: string; id?: number; result?: { tools?: unknown[] } });
    for (const m of messages) expect(m.jsonrpc).toBe('2.0');
    const list = messages.find((m) => m.id === 2);
    expect(list?.result?.tools).toHaveLength(5);

    p.child.stdin.end();
    expect(await exitWithin(p, 2_000)).toBe(0);
    for (const l of p.stdout().split('\n').filter(Boolean)) expect(JSON.parse(l).jsonrpc).toBe('2.0');
  }, 30_000);

  it('with the API down, a data tool answers isError "not reachable at <url>" on stdout', async () => {
    const url = 'http://127.0.0.1:9';
    const p = start({ DEVDIGEST_API_URL: url });
    const send = (m: unknown) => p.child.stdin.write(`${JSON.stringify(m)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    });
    await until(() => p.stdout().includes('\n'), 10_000, 'the initialize response');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_agents', arguments: {} } });
    await until(() => p.stdout().split('\n').filter(Boolean).length >= 2, 10_000, 'the tools/call response');

    const reply = p.stdout().split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((m) => m.id === 3);
    expect(reply.result.isError).toBe(true);
    const text: string = reply.result.content[0].text;
    expect(text).toContain(`not reachable at ${url}`);
    expect(text).not.toMatch(/^\s+at /m);

    p.child.stdin.end();
    expect(await exitWithin(p, 2_000)).toBe(0);
  }, 30_000);

  it('an invalid DEVDIGEST_API_URL exits 1 with the variable named on stderr and nothing on stdout', async () => {
    const p = start({ DEVDIGEST_API_URL: 'ftp://x' });
    p.child.stdin.end();
    expect(await exitWithin(p, 5_000)).toBe(1);
    expect(p.stdout()).toBe('');
    expect(p.stderr()).toContain('DEVDIGEST_API_URL');
  }, 30_000);
});
