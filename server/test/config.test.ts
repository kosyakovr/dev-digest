import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

/**
 * DEVDIGEST_PROMPT_LOG (server/specs/L03-prompt-logging.md § Config, AC-5, AM1).
 * `loadConfig` gets an explicit env object, so nothing here reads process.env or .env.
 * Verbose is honoured only for an EXPLICIT NODE_ENV of development/test; the zod
 * default ('development') must not count.
 */
describe('loadConfig — DEVDIGEST_PROMPT_LOG', () => {
  it('development + verbose -> verbose, and the default log level rises to debug', () => {
    const c = loadConfig({ NODE_ENV: 'development', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(c.promptLog).toBe('verbose');
    expect(c.promptLogRequested).toBe('verbose');
    expect(c.logLevel).toBe('debug');
    expect(c.promptLogIgnoredReason).toBeUndefined();
  });

  it('an explicit LOG_LEVEL wins over the verbose default', () => {
    const c = loadConfig({ NODE_ENV: 'development', DEVDIGEST_PROMPT_LOG: 'verbose', LOG_LEVEL: 'info' });
    expect(c.promptLog).toBe('verbose');
    expect(c.logLevel).toBe('info');
  });

  it('test + verbose -> verbose, but test logs stay silent', () => {
    const c = loadConfig({ NODE_ENV: 'test', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(c.promptLog).toBe('verbose');
    expect(c.logLevel).toBe('silent');
  });

  it('production + verbose -> default, the request is remembered, the reason names the env', () => {
    const c = loadConfig({ NODE_ENV: 'production', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(c.promptLog).toBe('default');
    expect(c.promptLogRequested).toBe('verbose');
    expect(c.promptLogIgnoredReason).toBe('NODE_ENV=production');
    expect(c.logLevel).toBe('info');
  });

  it('AM1: verbose with NODE_ENV unset -> default (the schema default does not count) and the reason', () => {
    const c = loadConfig({ DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(c.nodeEnv).toBe('development'); // the schema default is what the rest of the app sees
    expect(c.promptLog).toBe('default');
    expect(c.promptLogRequested).toBe('verbose');
    expect(c.promptLogIgnoredReason).toBe('NODE_ENV not set explicitly');
    expect(c.logLevel).toBe('info');
  });

  it('AM1: an empty or blank NODE_ENV is not explicit -> default, the reason, and no crash', () => {
    for (const blank of ['', '   ']) {
      const c = loadConfig({ NODE_ENV: blank, DEVDIGEST_PROMPT_LOG: 'verbose' });
      expect(c.nodeEnv, JSON.stringify(blank)).toBe('development');
      expect(c.promptLog).toBe('default');
      expect(c.promptLogRequested).toBe('verbose');
      expect(c.promptLogIgnoredReason).toBe('NODE_ENV not set explicitly');
      expect(c.logLevel).toBe('info');
    }
  });

  it('an empty DEVDIGEST_PROMPT_LOG is unset: default, nothing requested, no reason', () => {
    const c = loadConfig({ NODE_ENV: 'development', DEVDIGEST_PROMPT_LOG: '' });
    expect(c.promptLog).toBe('default');
    expect(c.promptLogRequested).toBe('default');
    expect(c.promptLogIgnoredReason).toBeUndefined();
    expect(c.logLevel).toBe('info');
  });

  it('absent flag and an explicit "default" both leave the log level alone', () => {
    for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'development', DEVDIGEST_PROMPT_LOG: 'default' }]) {
      const c = loadConfig(env);
      expect(c.promptLog).toBe('default');
      expect(c.promptLogRequested).toBe('default');
      expect(c.logLevel).toBe('info');
    }
  });
});
