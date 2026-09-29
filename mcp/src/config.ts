/**
 * Cross-cutting — the ONLY file in mcp/ that reads `process.env`. Everything
 * downstream of `index.ts` receives config as a plain value, never `process.env`
 * itself (onion-architecture §3, by analogy).
 */

export class ConfigError extends Error {}

export interface Config {
  /** `DEVDIGEST_API_BASE` with a validated http(s) scheme and no trailing slash. */
  apiBase: string;
}

const DEFAULT_API_BASE = 'http://localhost:3001';

/**
 * Reads and validates configuration. Defaults to `process.env` so production
 * code needs no argument; tests pass a plain object instead.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.DEVDIGEST_API_BASE ?? DEFAULT_API_BASE;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(
      `devdigest-mcp: DEVDIGEST_API_BASE must be an http(s) URL, got "${raw}"`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(
      `devdigest-mcp: DEVDIGEST_API_BASE must be an http(s) URL, got "${raw}"`,
    );
  }

  return { apiBase: raw.replace(/\/+$/, '') };
}
