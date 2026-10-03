/**
 * Cross-cutting: stderr logger. stdout belongs to the MCP transport, so this
 * file never touches it. One line per entry; callers pass method, route
 * template, status and ms, never a response body.
 */

export type LogLevel = 'error' | 'info' | 'debug';

export interface Logger {
  error(msg: string): void;
  info(msg: string): void;
  debug(msg: string): void;
}

const RANK: Record<LogLevel, number> = { error: 0, info: 1, debug: 2 };

export function createLogger(
  level: LogLevel,
  write: (line: string) => void = (s) => {
    process.stderr.write(s);
  },
): Logger {
  const emit = (at: LogLevel, msg: string): void => {
    if (RANK[at] > RANK[level]) return;
    write(`[devdigest-mcp] ${at} ${msg.replace(/[\r\n]+/g, ' ')}\n`);
  };
  return {
    error: (m) => emit('error', m),
    info: (m) => emit('info', m),
    debug: (m) => emit('debug', m),
  };
}

export const silentLogger: Logger = { error() {}, info() {}, debug() {} };
