/**
 * Cross-cutting config. Pure over the env object it is handed; only
 * `src/index.ts` passes `process.env`. Invalid values throw `ConfigError`
 * naming the variable. No secrets are read here.
 */
import type { LogLevel } from './log.ts';

export interface Config {
  apiUrl: string;
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEFAULT_API_URL = 'http://localhost:3001';

export function loadConfig(env: Record<string, string | undefined>): Config {
  const rawUrl = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ConfigError('DEVDIGEST_API_URL is not a valid URL (expected http://host:port).');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError('DEVDIGEST_API_URL must use http: or https:.');
  }
  const apiUrl = rawUrl.replace(/\/+$/, '');

  const rawLevel = env.DEVDIGEST_MCP_LOG?.trim().toLowerCase() || 'info';
  if (rawLevel !== 'error' && rawLevel !== 'info' && rawLevel !== 'debug') {
    throw new ConfigError('DEVDIGEST_MCP_LOG must be one of error, info, debug.');
  }
  return { apiUrl, logLevel: rawLevel };
}
