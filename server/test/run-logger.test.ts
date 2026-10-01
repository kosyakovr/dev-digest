import { describe, it, expect } from 'vitest';
import { RunLogger, type PinoLike } from '../src/platform/run-logger.js';
import { RunBus } from '../src/platform/sse.js';

/**
 * RunLogger: the Live Log / bus keeps the message as is; the pino mirror gets a
 * masked, mirror-safe text (server/specs/L03-prompt-logging.md AM2, AC-10).
 */

const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

function setup() {
  const bus = new RunBus();
  const lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
  const pino: PinoLike = {
    info: (obj, msg) => lines.push({ level: 'info', obj: obj as Record<string, unknown>, msg }),
    warn: (obj, msg) => lines.push({ level: 'warn', obj: obj as Record<string, unknown>, msg }),
    error: (obj, msg) => lines.push({ level: 'error', obj: obj as Record<string, unknown>, msg }),
    debug: (obj, msg) => lines.push({ level: 'debug', obj: obj as Record<string, unknown>, msg }),
  };
  const log = new RunLogger(bus, ['run-1'], pino, { prId: 'pr-1' });
  return { bus, lines, log };
}

describe('RunLogger.event — the pino mirror', () => {
  it('masks a secret in msg on the mirror, while the bus message is unchanged', () => {
    const { bus, lines, log } = setup();
    const msg = `found ${AWS_KEY} in config`;
    log.info(msg);
    expect(bus.buffer('run-1').map((e) => e.msg)).toEqual([msg]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toBe('found AKIA…[masked] in config');
    expect(JSON.stringify(lines)).not.toContain(AWS_KEY);
  });

  it('AM2: mirrorMsg replaces msg on the mirror only; the bus and the persisted log keep the title', () => {
    const { bus, lines, log } = setup();
    log.event(
      'info',
      'grounding dropped "SPEC-SENTINEL-42 phantom": lines 999-999 do not intersect',
      undefined,
      'grounding dropped 1 finding(s) (reason: line not in diff)',
    );
    expect(bus.buffer('run-1')[0]!.msg).toContain('SPEC-SENTINEL-42');
    expect(log.logFor('run-1')[0]!.msg).toContain('SPEC-SENTINEL-42');
    expect(lines[0]!.msg).toBe('grounding dropped 1 finding(s) (reason: line not in diff)');
    expect(JSON.stringify(lines)).not.toContain('SPEC-SENTINEL-42');
  });

  it('a secret inside mirrorMsg is masked too (backup layer)', () => {
    const { lines, log } = setup();
    log.event('info', 'whatever', undefined, `safe text with ${AWS_KEY}`);
    expect(lines[0]!.msg).toBe('safe text with AKIA…[masked]');
  });

  it('without mirrorMsg the mirror uses msg (existing behaviour kept)', () => {
    const { lines, log } = setup();
    log.info('Diff ready — 3 changed file(s)');
    expect(lines[0]!.msg).toBe('Diff ready — 3 changed file(s)');
    expect(lines[0]!.obj).toMatchObject({ prId: 'pr-1', runIds: ['run-1'], kind: 'info' });
  });

  it('keeps the kind -> level mapping (tool = debug, error = error)', () => {
    const { lines, log } = setup();
    log.tool('t');
    log.error('e');
    log.result('r');
    expect(lines.map((l) => l.level)).toEqual(['debug', 'error', 'info']);
  });

  it('works without a pino logger (bus only)', () => {
    const bus = new RunBus();
    const log = new RunLogger(bus, ['run-2']);
    expect(() => log.event('info', 'm', undefined, 'mirror')).not.toThrow();
    expect(bus.buffer('run-2')[0]!.msg).toBe('m');
  });
});
