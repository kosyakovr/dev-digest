import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('defaults the API url to http://localhost:3001', () => {
    expect(loadConfig({}).apiUrl).toBe('http://localhost:3001');
  });

  it('strips the trailing slash of a configured url', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:4000/' }).apiUrl).toBe(
      'http://127.0.0.1:4000',
    );
  });

  it('accepts https', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'https://devdigest.example' }).apiUrl).toBe(
      'https://devdigest.example',
    );
  });

  it('rejects a non-http protocol and names the variable', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'ftp://x' })).toThrow(/DEVDIGEST_API_URL/);
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'ftp://x' })).toThrow(ConfigError);
  });

  it('rejects a value that is not a url and names the variable', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not a url' })).toThrow(/DEVDIGEST_API_URL/);
  });

  it('defaults the log level to info and accepts error|info|debug', () => {
    expect(loadConfig({}).logLevel).toBe('info');
    expect(loadConfig({ DEVDIGEST_MCP_LOG: 'debug' }).logLevel).toBe('debug');
    expect(loadConfig({ DEVDIGEST_MCP_LOG: 'error' }).logLevel).toBe('error');
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ DEVDIGEST_MCP_LOG: 'verbose' })).toThrow(/DEVDIGEST_MCP_LOG/);
  });
});
