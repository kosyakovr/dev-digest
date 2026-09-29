/**
 * Cross-cutting — stderr-only logging. stdout carries MCP JSON-RPC messages
 * only (the process contract); nothing in this file, or anywhere else in
 * mcp/src, may write to stdout.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const suffix = fields !== undefined ? ` ${JSON.stringify(fields)}` : '';
  process.stderr.write(`devdigest-mcp ${level} ${msg}${suffix}\n`);
}
