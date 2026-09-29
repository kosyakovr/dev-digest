/**
 * WP4.tests — `loadConfig` (Contract § Config and constants).
 */
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults apiBase to http://localhost:3001 when unset', () => {
    expect(loadConfig({}).apiBase).toBe('http://localhost:3001');
  });

  it('strips a trailing slash from DEVDIGEST_API_BASE', () => {
    expect(loadConfig({ DEVDIGEST_API_BASE: 'http://127.0.0.1:4000/' }).apiBase).toBe('http://127.0.0.1:4000');
  });

  it.each(['ftp://x', 'nope'])('rejects a non-http(s) value %s', (value) => {
    expect(() => loadConfig({ DEVDIGEST_API_BASE: value })).toThrow(/must be an http\(s\) URL/);
  });

  it('reads process.env when called with no argument', () => {
    vi.stubEnv('DEVDIGEST_API_BASE', 'http://127.0.0.1:4000/');
    try {
      expect(loadConfig().apiBase).toBe('http://127.0.0.1:4000');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
